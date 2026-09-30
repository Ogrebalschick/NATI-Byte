import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { CircularGpa } from '../components/stats/CircularGpa';
import { BarProgress } from '../components/stats/BarProgress';
import { GradeBadge } from '../components/stats/GradeBadge';
import {
  computeGpa,
  deriveControlWeeks,
  parseAchievements,
  parseBacklogs,
  parseSemester,
  parseSubjects,
  type AchievementItem,
  type BacklogItem,
  type ControlWeekBar,
  type ProgressSubject,
} from '../components/stats/parseStats';

const STAT_TYPES = ['progress', 'academic_backlog', 'individual_progress'];

const StatisticsScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated, user, getStudentData, syncStatus } = useAuth();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<ProgressSubject[]>([]);
  const [weeks, setWeeks] = useState<ControlWeekBar[]>([]);
  const [backlogs, setBacklogs] = useState<BacklogItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [semester, setSemester] = useState<string | null>(null);
  const [hasProgress, setHasProgress] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (!isAuthenticated) return;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const items = await getStudentData(STAT_TYPES);
        const progressPayload = items.progress?.payload;
        const backlogPayload = items.academic_backlog?.payload;
        const achievementsPayload = items.individual_progress?.payload;
        setHasProgress(!!progressPayload);
        const nextSubjects = parseSubjects(progressPayload);
        setSubjects(nextSubjects);
        setWeeks(deriveControlWeeks(progressPayload, nextSubjects));
        setSemester(parseSemester(progressPayload));
        setBacklogs(parseBacklogs(backlogPayload));
        setAchievements(parseAchievements(achievementsPayload));
      } catch (err: any) {
        setError(err.message || 'Не удалось загрузить статистику');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getStudentData, isAuthenticated],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (syncStatus === 'success') load(true);
  }, [syncStatus, load]);

  if (!isAuthenticated) {
    return (
      <ScreenWrapper>
        <View style={[styles.guest, { paddingTop: insets.top + 48 }]}>
          <View style={styles.iconBubble}>
            <Ionicons name="stats-chart-outline" size={36} color="#0A84FF" />
          </View>
          <Text style={styles.guestTitle}>Статистика появится после входа</Text>
          <Text style={styles.guestText}>
            Войдите в BYTE и синхронизируйте личный кабинет НГТУ — средний балл, контрольные недели
            и долги соберутся здесь.
          </Text>
          <TouchableOpacity
            style={styles.cta}
            activeOpacity={0.85}
            onPress={() => router.push('/profile/auth')}
          >
            <Text style={styles.ctaText}>Войти в аккаунт</Text>
          </TouchableOpacity>
        </View>
      </ScreenWrapper>
    );
  }

  const gpa = computeGpa(subjects);
  const emptyCabinet = !hasProgress && !backlogs.length && !achievements.length && !loading;

  return (
    <ScreenWrapper>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor="#0A84FF"
          />
        }
      >
        <Text style={styles.kicker}>Успеваемость</Text>
        <Text style={styles.title}>Статистика</Text>
        {!!user?.student_group && (
          <Text style={styles.group}>Группа {user.student_group}</Text>
        )}
        {!!semester && <Text style={styles.semester}>{semester}</Text>}

        {loading && !refreshing ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color="#0A84FF" />
            <Text style={styles.muted}>Собираем оценки…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => load()}>
              <Text style={styles.retry}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : emptyCabinet ? (
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
            <View style={styles.gpaCard}>
              <CircularGpa value={gpa} />
              <Text style={styles.gpaHint}>
                {gpa == null
                  ? 'Недостаточно оценок, чтобы посчитать GPA'
                  : gpa >= 4.5
                    ? 'Отличный результат. Так держать.'
                    : gpa >= 3.5
                      ? 'Стабильно. Есть запас до пятёрок.'
                      : 'Есть куда расти — контрольные недели впереди.'}
              </Text>
            </View>

            {weeks.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.section}>Контрольные недели</Text>
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
              <Text style={styles.section}>Предметы</Text>
              {subjects.length === 0 ? (
                <Text style={styles.muted}>Список предметов пока пуст</Text>
              ) : (
                subjects.map((subject, index) => (
                  <View
                    key={`${subject.name}-${index}`}
                    style={[styles.subjectRow, index === subjects.length - 1 && styles.subjectLast]}
                  >
                    <View style={styles.subjectText}>
                      <Text style={styles.subjectName}>{subject.name}</Text>
                      <Text style={styles.subjectMeta}>
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
              <Text style={styles.section}>Академические задолженности</Text>
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
                    style={[styles.backlogRow, index === backlogs.length - 1 && styles.subjectLast]}
                  >
                    <View style={styles.subjectText}>
                      <Text style={styles.subjectName}>{item.subject}</Text>
                      <Text style={styles.subjectMeta}>
                        {[item.control_type, item.status, item.deadline].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Ionicons name="alert-circle" size={20} color="#FF453A" />
                  </View>
                ))
              )}
            </View>

            {achievements.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.section}>Достижения</Text>
                {achievements.map((item, index) => (
                  <View
                    key={`${item.title}-${index}`}
                    style={[styles.subjectRow, index === achievements.length - 1 && styles.subjectLast]}
                  >
                    <View style={styles.subjectText}>
                      <Text style={styles.subjectName}>{item.title}</Text>
                      <Text style={styles.subjectMeta}>
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
  semester: { color: '#8E8E93', fontSize: 13, marginTop: 2, marginBottom: 18 },
  gpaCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 12,
  },
  gpaHint: {
    marginTop: 12,
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  section: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  bars: { gap: 14 },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  backlogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  subjectLast: { borderBottomWidth: 0, paddingBottom: 0 },
  subjectText: { flex: 1 },
  subjectName: { color: '#F2F2F7', fontSize: 15, fontWeight: '600' },
  subjectMeta: { color: '#8E8E93', fontSize: 12, marginTop: 3 },
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
  emptyCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 4 },
  emptyText: { color: '#8E8E93', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  centerBlock: { alignItems: 'center', gap: 10, marginTop: 48 },
  muted: { color: '#8E8E93', fontSize: 13 },
  errorCard: {
    backgroundColor: 'rgba(255,69,58,0.12)',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    gap: 8,
  },
  errorText: { color: '#FF8A84', fontSize: 14, lineHeight: 20 },
  retry: { color: '#0A84FF', fontWeight: '700', fontSize: 14 },
  guest: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(10,132,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  guestTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  guestText: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },
  cta: {
    marginTop: 24,
    backgroundColor: '#0A84FF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default StatisticsScreen;
