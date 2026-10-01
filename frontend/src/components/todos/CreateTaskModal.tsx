/**
 * CreateTaskModal — модальное окно создания / редактирования задачи.
 *
 * Режимы:
 *   • Создание (editingTask = null): поля пустые, кнопка «Добавить задачу».
 *   • Редактирование (editingTask = <task>): поля предзаполнены, кнопка «Сохранить».
 *
 * Поля:
 *   • Название, описание
 *   • Проект: чипы + «+ Новый» → TextInput
 *   • Раздел: чипы текущего проекта + «+ Новый» → TextInput
 *   • Дедлайн (due_date): DateTimePicker (iOS inline, Android 2-step)
 *   • Дата выполнения (schedule_date): то же самое
 *   • Длительность (duration_minutes): TextInput для ввода минут
 *   • Приоритет: 4 кнопки P1–P4
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type { TodoProject, TodoTask } from '../../storage/todosStorage';

// ── Design tokens ─────────────────────────────────────────────────────────────

const CARD   = '#1C1C1E';
const CARD2  = '#232228';
const BORDER = '#2C2C2E';
const MUTED  = '#636366';
const TEXT   = '#EBEBF5';
const TEXT2  = '#8E8E93';

const PRIORITY_COLOR: Record<number, string> = {
  1: '#FF453A', 2: '#FF9F0A', 3: '#0A84FF', 4: '#48484A',
};
const PRIORITY_LABEL: Record<number, string> = {
  1: 'P1 Срочно', 2: 'P2 Высокий', 3: 'P3 Обычный', 4: 'P4 Нет',
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateTaskPayload {
  title: string;
  description: string;
  /** number = существующий проект ID, string = новое имя, null = Входящие */
  project_id: number | string | null;
  /** number = существующий раздел ID, string = новое имя, null = без раздела */
  section_id: number | string | null;
  due_date: string | null;
  schedule_date: string | null;
  duration_minutes: number | null;
  priority: 1 | 2 | 3 | 4;
}

interface Props {
  visible: boolean;
  projects: TodoProject[];
  defaultProjectId: string | null;
  onClose: () => void;
  onSubmit: (payload: CreateTaskPayload) => void;
  /** Если передан — форма открывается в режиме редактирования */
  editingTask?: TodoTask | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── DateTimeField: reusable date+time picker row ──────────────────────────────

interface DateTimeFieldProps {
  label: string;
  icon: 'alarm-outline' | 'calendar-outline';
  value: Date | null;
  accentColor: string;
  onChange: (d: Date | null) => void;
}

function DateTimeField({ label, icon, value, accentColor, onChange }: DateTimeFieldProps) {
  // Android: two-step picker (date → time)
  const [androidStep, setAndroidStep] = useState<'date' | 'time' | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  // iOS: show inline picker inside a small collapsible
  const [iosOpen, setIosOpen] = useState(false);

  const handleAndroidChange = (e: DateTimePickerEvent, picked?: Date) => {
    if (!picked || e.type === 'dismissed') {
      setAndroidStep(null);
      return;
    }
    if (androidStep === 'date') {
      setTempDate(picked);
      setAndroidStep('time'); // next step
    } else {
      // combine: date from tempDate, time from picked
      const combined = new Date(tempDate);
      combined.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      onChange(combined);
      setAndroidStep(null);
    }
  };

  const openPicker = () => {
    const base = value ?? new Date();
    setTempDate(base);
    if (Platform.OS === 'android') {
      setAndroidStep('date');
    } else {
      setIosOpen(prev => !prev);
    }
  };

  const clearDate = () => {
    onChange(null);
    setIosOpen(false);
  };

  return (
    <View style={dtStyles.root}>
      {/* Row: label + button */}
      <View style={dtStyles.row}>
        <Ionicons name={icon} size={15} color={value ? accentColor : MUTED} style={dtStyles.icon} />
        <Text style={dtStyles.label}>{label}</Text>
        {value ? (
          <View style={dtStyles.valueRow}>
            <TouchableOpacity onPress={openPicker} activeOpacity={0.7}>
              <Text style={[dtStyles.valueText, { color: accentColor }]}>
                {fmtDateTime(value)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearDate} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={openPicker} activeOpacity={0.7} style={dtStyles.setBtn}>
            <Text style={dtStyles.setBtnText}>Выбрать</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* iOS inline picker */}
      {Platform.OS === 'ios' && iosOpen && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="datetime"
          display="spinner"
          locale="ru-RU"
          onChange={(_, picked) => {
            if (picked) onChange(picked);
          }}
          style={dtStyles.iosPicker}
          textColor={TEXT}
        />
      )}

      {/* Android dialog picker */}
      {Platform.OS === 'android' && androidStep !== null && (
        <DateTimePicker
          value={androidStep === 'time' ? tempDate : (value ?? new Date())}
          mode={androidStep}
          display="default"
          locale="ru-RU"
          onChange={handleAndroidChange}
        />
      )}
    </View>
  );
}

const dtStyles = StyleSheet.create({
  root: { marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CARD2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  icon: {},
  label: { flex: 1, fontSize: 13, color: TEXT2, fontWeight: '500' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valueText: { fontSize: 13, fontWeight: '600' },
  setBtn: {
    backgroundColor: 'rgba(10,132,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  setBtnText: { color: '#0A84FF', fontSize: 12, fontWeight: '600' },
  iosPicker: { height: 120 },
});

// ── CreateTaskModal ───────────────────────────────────────────────────────────

export function CreateTaskModal({
  visible,
  projects,
  defaultProjectId,
  onClose,
  onSubmit,
  editingTask,
}: Props) {
  const isEditMode = !!editingTask;

  // ── Basic fields ───────────────────────────────────────────────────────────
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(4);

  // ── Dates ─────────────────────────────────────────────────────────────────
  const [dueDate, setDueDate]           = useState<Date | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);

  // ── Duration ──────────────────────────────────────────────────────────────
  const [durationText, setDurationText] = useState<string>('30');

  // ── Project selector state ─────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<number | 'new' | null>(null);
  const [newProjectName, setNewProjectName] = useState('');

  // ── Section selector state ─────────────────────────────────────────────────
  const [selectedSectionId, setSelectedSectionId] = useState<number | 'new' | null>(null);
  const [newSectionName, setNewSectionName] = useState('');

  // ── Populate / reset on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    if (editingTask) {
      // Edit mode — pre-fill from existing task
      setTitle(editingTask.title);
      setDesc(editingTask.description ?? '');
      setPriority(editingTask.priority);
      setDueDate(editingTask.due_date ? new Date(editingTask.due_date) : null);
      setScheduleDate(editingTask.schedule_date ? new Date(editingTask.schedule_date) : null);
      setDurationText(String(editingTask.duration_minutes ?? 30));

      const pid = editingTask.project_id ? Number(editingTask.project_id) : null;
      setSelectedProjectId(!isNaN(pid as number) ? pid : null);

      const sid = editingTask.section_id ? Number(editingTask.section_id) : null;
      setSelectedSectionId(!isNaN(sid as number) ? sid : null);

      setNewProjectName('');
      setNewSectionName('');
    } else {
      // Create mode — reset fields
      setTitle('');
      setDesc('');
      setPriority(4);
      setDueDate(null);
      setScheduleDate(null);
      setDurationText('30');
      const num = defaultProjectId ? Number(defaultProjectId) : null;
      setSelectedProjectId(num && !isNaN(num) ? num : null);
      setSelectedSectionId(null);
      setNewProjectName('');
      setNewSectionName('');
    }
  }, [visible, editingTask, defaultProjectId]);

  // ── Reset helper ──────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setTitle('');
    setDesc('');
    setPriority(4);
    setDueDate(null);
    setScheduleDate(null);
    setDurationText('30');
    setSelectedProjectId(null);
    setSelectedSectionId(null);
    setNewProjectName('');
    setNewSectionName('');
  }, []);

  const handleClose = () => { reset(); onClose(); };

  // ── Sections of selected project ──────────────────────────────────────────
  const selectedProject = typeof selectedProjectId === 'number'
    ? projects.find(p => Number(p.id) === selectedProjectId) ?? null
    : null;

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Укажите название задачи');
      return;
    }

    // Resolve project reference
    let projectRef: number | string | null = null;
    if (selectedProjectId === 'new' && newProjectName.trim()) {
      projectRef = newProjectName.trim();
    } else if (typeof selectedProjectId === 'number') {
      projectRef = selectedProjectId;
    }

    // Resolve section reference
    let sectionRef: number | string | null = null;
    if (selectedSectionId === 'new' && newSectionName.trim()) {
      sectionRef = newSectionName.trim();
    } else if (typeof selectedSectionId === 'number') {
      sectionRef = selectedSectionId;
    }

    // Parse duration
    const parsedDuration = parseInt(durationText, 10);
    const duration = !isNaN(parsedDuration) && parsedDuration > 0
      ? Math.min(parsedDuration, 1440)
      : 30;

    onSubmit({
      title: trimmedTitle,
      description,
      project_id: projectRef,
      section_id: sectionRef,
      due_date: dueDate?.toISOString() ?? null,
      schedule_date: scheduleDate?.toISOString() ?? null,
      duration_minutes: duration,
      priority,
    });

    reset();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheet}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.sheetContent}
        >
          {/* Handle */}
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>
            {isEditMode ? 'Редактировать задачу' : 'Новая задача'}
          </Text>

          {/* ── Title ──────────────────────────────────────────────────── */}
          <TextInput
            style={styles.input}
            placeholder="Название задачи"
            placeholderTextColor={MUTED}
            value={title}
            onChangeText={setTitle}
            autoFocus={!isEditMode}
            returnKeyType="next"
          />

          {/* ── Description ────────────────────────────────────────────── */}
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Описание (необязательно)"
            placeholderTextColor={MUTED}
            value={description}
            onChangeText={setDesc}
            multiline
            numberOfLines={3}
          />

          {/* ── Project selector ───────────────────────────────────────── */}
          {!isEditMode && (
            <>
              <Text style={styles.sectionLabel}>Проект</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {/* Inbox chip */}
                <TouchableOpacity
                  onPress={() => { setSelectedProjectId(null); setSelectedSectionId(null); setNewProjectName(''); }}
                  style={[styles.chip, selectedProjectId === null && styles.chipActive]}
                >
                  <Ionicons name="archive-outline" size={12} color={selectedProjectId === null ? '#fff' : TEXT2} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipText, selectedProjectId === null && styles.chipTextActive]}>Входящие</Text>
                </TouchableOpacity>

                {/* Existing projects */}
                {projects.map(p => {
                  const pid = Number(p.id);
                  const isSelected = selectedProjectId === pid;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setSelectedProjectId(pid); setSelectedSectionId(null); setNewProjectName(''); }}
                      style={[styles.chip, isSelected && styles.chipActive]}
                    >
                      <View style={[styles.chipDot, { backgroundColor: p.color }]} />
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{p.name}</Text>
                    </TouchableOpacity>
                  );
                })}

                {/* "New project" chip */}
                <TouchableOpacity
                  onPress={() => { setSelectedProjectId('new'); setSelectedSectionId(null); }}
                  style={[styles.chip, styles.chipNew, selectedProjectId === 'new' && styles.chipNewActive]}
                >
                  <Ionicons name="add" size={14} color={selectedProjectId === 'new' ? '#0A84FF' : TEXT2} />
                  <Text style={[styles.chipText, selectedProjectId === 'new' && { color: '#0A84FF' }]}>Новый</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* New project name input */}
              {selectedProjectId === 'new' && (
                <TextInput
                  style={[styles.input, { marginTop: 6 }]}
                  placeholder="Название нового проекта..."
                  placeholderTextColor={MUTED}
                  value={newProjectName}
                  onChangeText={setNewProjectName}
                  autoFocus
                />
              )}

              {/* ── Section selector ────────────────────────────────────── */}
              {(selectedProject || selectedProjectId === 'new') && (
                <>
                  <Text style={styles.sectionLabel}>Раздел</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <TouchableOpacity
                      onPress={() => { setSelectedSectionId(null); setNewSectionName(''); }}
                      style={[styles.chip, selectedSectionId === null && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, selectedSectionId === null && styles.chipTextActive]}>Без раздела</Text>
                    </TouchableOpacity>

                    {(selectedProject?.sections ?? []).map(s => {
                      const sid = Number(s.id);
                      const isSelected = selectedSectionId === sid;
                      return (
                        <TouchableOpacity
                          key={s.id}
                          onPress={() => { setSelectedSectionId(sid); setNewSectionName(''); }}
                          style={[styles.chip, isSelected && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{s.name}</Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      onPress={() => setSelectedSectionId('new')}
                      style={[styles.chip, styles.chipNew, selectedSectionId === 'new' && styles.chipNewActive]}
                    >
                      <Ionicons name="add" size={14} color={selectedSectionId === 'new' ? '#0A84FF' : TEXT2} />
                      <Text style={[styles.chipText, selectedSectionId === 'new' && { color: '#0A84FF' }]}>Новый</Text>
                    </TouchableOpacity>
                  </ScrollView>

                  {selectedSectionId === 'new' && (
                    <TextInput
                      style={[styles.input, { marginTop: 6 }]}
                      placeholder="Название нового раздела..."
                      placeholderTextColor={MUTED}
                      value={newSectionName}
                      onChangeText={setNewSectionName}
                    />
                  )}
                </>
              )}
            </>
          )}

          {/* ── Priority ───────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Приоритет</Text>
          <View style={styles.priorityRow}>
            {([1, 2, 3, 4] as const).map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setPriority(p)}
                activeOpacity={0.8}
                style={[
                  styles.priorityBtn,
                  {
                    borderColor: PRIORITY_COLOR[p],
                    backgroundColor: priority === p ? PRIORITY_COLOR[p] : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.priorityBtnText, { color: priority === p ? '#fff' : PRIORITY_COLOR[p] }]}>
                  {PRIORITY_LABEL[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Date fields ────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Даты</Text>
          <DateTimeField
            label="Дедлайн (крайний срок)"
            icon="alarm-outline"
            value={dueDate}
            accentColor="#FF453A"
            onChange={setDueDate}
          />
          <View style={{ height: 8 }} />
          <DateTimeField
            label="Дата выполнения (план)"
            icon="calendar-outline"
            value={scheduleDate}
            accentColor="#0A84FF"
            onChange={setScheduleDate}
          />

          {/* ── Duration ───────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Длительность</Text>
          <View style={styles.durationRow}>
            <Ionicons name="timer-outline" size={15} color={MUTED} />
            <TextInput
              style={styles.durationInput}
              value={durationText}
              onChangeText={t => setDurationText(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholderTextColor={MUTED}
              placeholder="30"
              maxLength={4}
            />
            <Text style={styles.durationUnit}>мин</Text>
            {/* Quick presets */}
            {[15, 30, 60, 90].map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setDurationText(String(m))}
                style={[
                  styles.durationPreset,
                  durationText === String(m) && styles.durationPresetActive,
                ]}
              >
                <Text style={[
                  styles.durationPresetText,
                  durationText === String(m) && styles.durationPresetTextActive,
                ]}>
                  {m >= 60 ? `${m / 60}ч` : `${m}м`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Submit ─────────────────────────────────────────────────── */}
          <TouchableOpacity
            onPress={handleSubmit}
            activeOpacity={0.85}
            style={styles.submitBtn}
          >
            <Text style={styles.submitText}>
              {isEditMode ? 'Сохранить изменения' : 'Добавить задачу'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#48484A',
    alignSelf: 'center',
    marginTop: 10, marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: TEXT, marginBottom: 14,
  },

  // Inputs
  input: {
    backgroundColor: CARD2, borderRadius: 10, padding: 12,
    color: TEXT, fontSize: 15,
    borderWidth: 1, borderColor: BORDER, marginBottom: 10,
  },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },

  // Section label
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: MUTED,
    letterSpacing: 1, textTransform: 'uppercase',
    marginTop: 8, marginBottom: 8,
  },

  // Chips
  chipRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: CARD2,
    borderWidth: 1, borderColor: BORDER,
  },
  chipActive: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  chipNew: { borderStyle: 'dashed', borderColor: TEXT2 },
  chipNewActive: { borderColor: '#0A84FF', borderStyle: 'solid' },
  chipDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  chipText: { fontSize: 13, fontWeight: '500', color: TEXT2 },
  chipTextActive: { color: '#fff' },

  // Priority
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  priorityBtn: {
    flex: 1, minWidth: 70,
    paddingVertical: 7, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center',
  },
  priorityBtnText: { fontSize: 12, fontWeight: '700' },

  // Duration
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  durationInput: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '600',
    minWidth: 44,
    textAlign: 'center',
  },
  durationUnit: { color: TEXT2, fontSize: 13, marginRight: 4 },
  durationPreset: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
  },
  durationPresetActive: { backgroundColor: 'rgba(10,132,255,0.25)' },
  durationPresetText: { fontSize: 12, color: TEXT2, fontWeight: '600' },
  durationPresetTextActive: { color: '#0A84FF' },

  // Submit
  submitBtn: {
    backgroundColor: '#0A84FF', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
