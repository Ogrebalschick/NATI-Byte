import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { CircularPercent } from '../components/stats/CircularPercent';
import { CircularGpa } from '../components/stats/CircularGpa';
import { BarProgress } from '../components/stats/BarProgress';
import { GradeBadge } from '../components/stats/GradeBadge';
import { AddScoreModal, AddSubjectModal } from '../components/stats/SubjectTrackerModals';
import { addSubjectScore, createSubject, deleteSubjectScore, fetchSubjects } from '../api/subjectsApi';
import {
  addGuestScore,
  addGuestSubject,
  loadGuestSubjects,
  removeGuestScore,
  saveGuestSubjects,
} from '../storage/subjectsStorage';
import { overallProgress, sumScores, type TrackedSubject } from '../types/subjects';
import {
  computeGpa,
  deriveControlWeeks,
  parseAchievements,
  parseBacklogs,
  parseSubjects,
  type AchievementItem,
  type BacklogItem,
  type ControlWeekBar,
  type ProgressSubject,
} from '../components/stats/parseStats';

const STAT_TYPES = ['progress', 'academic_backlog', 'individual_progress'];

function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function ballWord(value: number): string {
  const abs = Math.abs(Math.trunc(value));
  const n10 = abs % 10;
  const n100 = abs % 100;
  if (n10 === 1 && n100 !== 11) return 'балл';
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'балла';
  return 'баллов';
}

function formatRuDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\s*г\.?$/i, '');
}

function barTint(subject: TrackedSubject): string {
  const earned = sumScores(subject);
  if (earned >= subject.target_score && subject.target_score > 0) return '#30D158';
  return '#0A84FF';
}

const StatisticsScreen = () => {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, token, user, getStudentData, syncStatus } = useAuth();

  const [subjects, setSubjects] = useState<TrackedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [scoreSubject, setScoreSubject] = useState<TrackedSubject | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const [cabinetSubjects, setCabinetSubjects] = useState<ProgressSubject[]>([]);
  const [weeks, setWeeks] = useState<ControlWeekBar[]>([]);
  const [backlogs, setBacklogs] = useState<BacklogItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [hasProgress, setHasProgress] = useState(false);

  const persistGuest = useCallback(async (next: TrackedSubject[]) => {
    setSubjects(next);
    await saveGuestSubjects(next);
  }, []);

  const load = useCallback(
    async (soft = false) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        if (isAuthenticated && token) {
          let items = await fetchSubjects(token);
          const guestItems = await loadGuestSubjects();
          if (guestItems.length > 0) {
            for (const item of guestItems) {
              const created = await createSubject(token, {
                name: item.name,
                max_score: item.max_score,
                target_score: item.target_score,
              });
              for (const log of [...item.scores].reverse()) {
                await addSubjectScore(token, created.id, {
                  score: log.score,
                  description: log.description,
                  created_at: log.created_at,
                });
              }
            }
            await saveGuestSubjects([]);
            items = await fetchSubjects(token);
          }
          setSubjects(items);
          try {
            const cabinet = await getStudentData(STAT_TYPES);
            const progressPayload = cabinet.progress?.payload;
            const nextCabinet = parseSubjects(progressPayload);
            setHasProgress(!!progressPayload);
            setCabinetSubjects(nextCabinet);
            setWeeks(deriveControlWeeks(progressPayload, nextCabinet));
            setBacklogs(parseBacklogs(cabinet.academic_backlog?.payload));
            setAchievements(parseAchievements(cabinet.individual_progress?.payload));
          } catch {
            setHasProgress(false);
            setCabinetSubjects([]);
            setWeeks([]);
            setBacklogs([]);
            setAchievements([]);
          }
        } else {
          setSubjects(await loadGuestSubjects());
          setHasProgress(false);
          setCabinetSubjects([]);
          setWeeks([]);
          setBacklogs([]);
          setAchievements([]);
        }
      } catch (err: any) {
        setError(err.message || 'Не удалось загрузить предметы');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated, token, getStudentData],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (syncStatus === 'success') load(true);
  }, [syncStatus, load]);

  const totals = useMemo(() => overallProgress(subjects), [subjects]);
  const gpa = useMemo(() => computeGpa(cabinetSubjects), [cabinetSubjects]);

  const handleCreateSubject = async (input: {
    name: string;
    target_score: number;
    max_score: number;
  }) => {
    setSaving(true);
    try {
      if (isAuthenticated && token) {
        const created = await createSubject(token, input);
        setSubjects(prev => [...prev, created]);
      } else {
        const next = addGuestSubject(subjects, input);
        await persistGuest(next);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddScore = async (input: {
    score: number;
    description: string | null;
    created_at: string;
  }) => {
    if (!scoreSubject) return;
    setSaving(true);
    try {
      if (isAuthenticated && token) {
        const entry = await addSubjectScore(token, scoreSubject.id, input);
        setSubjects(prev =>
          prev.map(item => {
            if (item.id !== scoreSubject.id) return item;
            const scores = [entry, ...item.scores].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            );
            return {
              ...item,
              scores,
              current_score: scores.reduce((acc, log) => acc + log.score, 0),
            };
          }),
        );
        setExpanded(prev => ({ ...prev, [scoreSubject.id]: true }));
      } else {
        const next = addGuestScore(subjects, scoreSubject.id, input);
        await persistGuest(next);
        setExpanded(prev => ({ ...prev, [scoreSubject.id]: true }));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteScore = async (subjectId: number, scoreId: number) => {
    try {
      if (isAuthenticated && token) {
        await deleteSubjectScore(token, subjectId, scoreId);
        setSubjects(prev =>
          prev.map(item => {
            if (item.id !== subjectId) return item;
            const scores = item.scores.filter(log => log.id !== scoreId);
            return {
              ...item,
              scores,
              current_score: scores.reduce((acc, log) => acc + log.score, 0),
            };
          }),
        );
        return;
      }
      await persistGuest(removeGuestScore(subjects, subjectId, scoreId));
    } catch (err: any) {
      setError(err.message || 'Не удалось удалить запись');
    }
  };

  return (
    <ScreenWrapper>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 40 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#0A84FF" />
        }
      >
        <Text style={styles.kicker}>Трекер баллов</Text>
        <Text style={styles.title}>Статистика</Text>
        {!!user?.student_group && <Text style={styles.group}>Группа {user.student_group}</Text>}
        {!isAuthenticated && (
          <Text style={styles.guestNote}>Гостевой режим — предметы хранятся на этом устройстве</Text>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Успеваемость по баллам</Text>
          <Text style={styles.heroSubtitle}>Сумма ручных баллов ко всем максимумам предметов</Text>
          <View style={styles.heroRing}>
            <CircularPercent percent={totals.percent} caption="" />
          </View>
          <Text style={styles.heroMeta}>
            {subjects.length === 0
              ? 'Добавь предметы, чтобы видеть общий прогресс'
              : `Набрано ${formatScore(totals.earned)} из ${formatScore(totals.max)} баллов`}
          </Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.section}>Предметы</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setAddSubjectOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Добавить предмет</Text>
          </TouchableOpacity>
        </View>

        {loading && !refreshing ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color="#0A84FF" />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => load()}>
              <Text style={styles.retry}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : subjects.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="book-outline" size={28} color="#0A84FF" />
            <Text style={styles.emptyTitle}>Пока нет предметов</Text>
            <Text style={styles.emptyText}>
              Добавь курс и отмечай баллы сам — пока преподаватель не выставил их в ЛК.
            </Text>
          </View>
        ) : (
          subjects.map(subject => {
            const earned = sumScores(subject);
            const max = subject.max_score || 1;
            const ratio = Math.max(0, Math.min(earned / max, 1));
            const open = !!expanded[subject.id];
            return (
              <View key={subject.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <TouchableOpacity
                    style={styles.cardTitleWrap}
                    onPress={() =>
                      setExpanded(prev => ({ ...prev, [subject.id]: !prev[subject.id] }))
                    }
                    activeOpacity={0.8}
                  >
                    <Text style={styles.subjectName}>{subject.name}</Text>
                    <Text style={styles.subjectStatus}>
                      Набрано {formatScore(earned)} / {formatScore(subject.max_score)} баллов
                      (Цель: {formatScore(subject.target_score)})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.plusBtn}
                    onPress={() => setScoreSubject(subject)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="add" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.round(ratio * 100)}%`, backgroundColor: barTint(subject) },
                    ]}
                  />
                </View>

                <TouchableOpacity
                  style={styles.historyToggle}
                  onPress={() => setExpanded(prev => ({ ...prev, [subject.id]: !prev[subject.id] }))}
                >
                  <Text style={styles.historyToggleText}>
                    {open ? 'Скрыть историю' : `История · ${subject.scores.length}`}
                  </Text>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#8E8E93" />
                </TouchableOpacity>

                {open && (
                  <View style={styles.history}>
                    {subject.scores.length === 0 ? (
                      <Text style={styles.historyEmpty}>Пока нет записей — нажми +</Text>
                    ) : (
                      subject.scores.map(log => {
                        const sign = log.score > 0 ? '+' : '';
                        const desc = log.description ? ` — ${log.description}` : '';
                        return (
                          <View key={log.id} style={styles.historyRow}>
                            <Text style={styles.historyItem}>
                              • {sign}
                              {formatScore(log.score)} {ballWord(log.score)}
                              {desc} ({formatRuDate(log.created_at)})
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleDeleteScore(subject.id, log.id)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="trash-outline" size={16} color="#FF453A" />
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={styles.officialHeader}>
          <Text style={styles.officialKicker}>Личный кабинет НГТУ</Text>
          <Text style={styles.section}>Официальная успеваемость</Text>
        </View>

        {!isAuthenticated ? (
          <View style={styles.emptyCard}>
            <Ionicons name="school-outline" size={28} color="#0A84FF" />
            <Text style={styles.emptyTitle}>Данные ЛК появятся после входа</Text>
            <Text style={styles.emptyText}>
              Синхронизируйте кабинет в Профиле — здесь будут GPA, контрольные недели и задолженности.
            </Text>
          </View>
        ) : !hasProgress && !backlogs.length && !achievements.length ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-download-outline" size={28} color="#0A84FF" />
            <Text style={styles.emptyTitle}>Пока нет данных из ЛК</Text>
            <Text style={styles.emptyText}>
              Импортируйте кабинет НГТУ в Профиле — после синхронизации здесь появятся оценки и
              контрольные недели.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.blockTitle}>GPA по сессии</Text>
              <View style={styles.gpaWrap}>
                <CircularGpa value={gpa} />
              </View>
            </View>

            {weeks.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.blockTitle}>Контрольные недели</Text>
                <View style={styles.bars}>
                  {weeks.map(week => (
                    <BarProgress
                      key={week.label}
                      label={week.label}
                      value={week.value}
                      max={week.max}
                      tint="#64D2FF"
                    />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.blockTitle}>Официальные оценки</Text>
              {cabinetSubjects.length === 0 ? (
                <Text style={styles.historyEmpty}>Список предметов из зачётки пуст</Text>
              ) : (
                cabinetSubjects.map((subject, index) => (
                  <View
                    key={`${subject.name}-${index}`}
                    style={[styles.gradeRow, index === cabinetSubjects.length - 1 && styles.gradeLast]}
                  >
                    <View style={styles.gradeText}>
                      <Text style={styles.gradeName}>{subject.name}</Text>
                      <Text style={styles.gradeMeta}>
                        {[subject.control_type, subject.teacher].filter(Boolean).join(' · ') ||
                          'Без типа контроля'}
                      </Text>
                    </View>
                    {subject.grade ? (
                      <GradeBadge grade={subject.grade} />
                    ) : subject.points != null ? (
                      <GradeBadge grade={`${subject.points}`} />
                    ) : (
                      <GradeBadge grade="—" />
                    )}
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.blockTitle}>Академические задолженности</Text>
              {backlogs.length === 0 ? (
                <View style={styles.okStub}>
                  <View style={styles.okIcon}>
                    <Ionicons name="sparkles" size={22} color="#30D158" />
                  </View>
                  <Text style={styles.okTitle}>Долгов нет, ты супер!</Text>
                  <Text style={styles.okText}>Сессия чистая — можно выдохнуть.</Text>
                </View>
              ) : (
                backlogs.map((item, index) => (
                  <View
                    key={`${item.subject}-${index}`}
                    style={[styles.gradeRow, index === backlogs.length - 1 && styles.gradeLast]}
                  >
                    <View style={styles.gradeText}>
                      <Text style={styles.gradeName}>{item.subject}</Text>
                      <Text style={styles.gradeMeta}>
                        {[item.teacher, item.control_type, item.status, item.deadline]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <Ionicons name="alert-circle" size={20} color="#FF453A" />
                  </View>
                ))
              )}
            </View>

            {achievements.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.blockTitle}>Достижения</Text>
                {achievements.map((item, index) => (
                  <View
                    key={`${item.title}-${index}`}
                    style={[styles.gradeRow, index === achievements.length - 1 && styles.gradeLast]}
                  >
                    <View style={styles.gradeText}>
                      <Text style={styles.gradeName}>{item.title}</Text>
                      <Text style={styles.gradeMeta}>
                        {[item.category, item.level, item.date].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {item.result ? <GradeBadge grade={item.result} /> : null}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <AddSubjectModal
        visible={addSubjectOpen}
        loading={saving}
        onClose={() => setAddSubjectOpen(false)}
        onSubmit={handleCreateSubject}
      />
      <AddScoreModal
        visible={!!scoreSubject}
        subjectName={scoreSubject?.name}
        loading={saving}
        onClose={() => setScoreSubject(null)}
        onSubmit={handleAddScore}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1, marginHorizontal: -16 },
  content: { paddingHorizontal: 16 },
  kicker: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 4 },
  group: { color: '#0A84FF', fontSize: 14, fontWeight: '600', marginTop: 6 },
  guestNote: { color: '#8E8E93', fontSize: 13, marginTop: 6, marginBottom: 4 },
  heroCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 22,
    paddingHorizontal: 18,
    marginTop: 18,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  heroRing: {
    marginTop: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  heroMeta: {
    marginTop: 40,
    color: '#C7C7CC',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
    gap: 12,
  },
  section: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0A84FF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitleWrap: { flex: 1, paddingRight: 4, minHeight: 56 },
  subjectName: { color: '#F2F2F7', fontSize: 17, fontWeight: '800', lineHeight: 22 },
  subjectStatus: {
    color: '#C7C7CC',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 8,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
    overflow: 'hidden',
    marginTop: 2,
  },
  fill: { height: '100%', borderRadius: 8 },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  historyToggleText: { color: '#8E8E93', fontSize: 12, fontWeight: '600' },
  history: { marginTop: 8, gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  historyEmpty: { color: '#636366', fontSize: 12 },
  historyItem: { flex: 1, color: '#C7C7CC', fontSize: 12, lineHeight: 17 },
  emptyCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 4 },
  emptyText: { color: '#8E8E93', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  centerBlock: { alignItems: 'center', marginTop: 24 },
  errorCard: {
    backgroundColor: 'rgba(255,69,58,0.12)',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  errorText: { color: '#FF8A84', fontSize: 14, lineHeight: 20 },
  retry: { color: '#0A84FF', fontWeight: '700', fontSize: 14 },
  officialHeader: {
    marginTop: 28,
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2C2C2E',
  },
  officialKicker: {
    color: '#0A84FF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  blockTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
  },
  gpaWrap: { alignItems: 'center' },
  gpa: { marginBottom: 26 },
  bars: { gap: 14 },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  gradeLast: { borderBottomWidth: 0, paddingBottom: 0 },
  gradeText: { flex: 1 },
  gradeName: { color: '#F2F2F7', fontSize: 15, fontWeight: '700' },
  gradeMeta: { color: '#8E8E93', fontSize: 12, marginTop: 4, lineHeight: 16 },
  okStub: { alignItems: 'center', paddingVertical: 12, gap: 6 },
  okIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(48,209,88,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  okTitle: { color: '#30D158', fontSize: 16, fontWeight: '700' },
  okText: { color: '#8E8E93', fontSize: 13 },
});

export default StatisticsScreen;
