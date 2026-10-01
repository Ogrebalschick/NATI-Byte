import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { isSessionExpired } from '../api/http';
import {
  apiCreateProject,
  apiCreateSection,
  apiCreateTask,
  apiDeleteTask,
  apiUpdateTask,
  fetchTodosData,
  type ApiProject,
  type ApiSection,
  type ApiTask,
  type ApiTodosData,
  type TaskCreatePayload,
} from '../api/todosApi';
import {
  addTaskToTree,
  clearGuestTodos,
  emptyTodosData,
  guestId,
  loadGuestTodos,
  removeTaskFromTree,
  saveGuestTodos,
  type TodoProject,
  type TodosData,
  type TodoTask,
} from '../storage/todosStorage';

// ── Constants ─────────────────────────────────────────────────────────────────

const BG = '#17161B';
const CARD = '#1C1C1E';
const CARD2 = '#232228';
const BORDER = '#2C2C2E';
const MUTED = '#636366';
const TEXT = '#EBEBF5';
const TEXT2 = '#8E8E93';

const PRIORITY_COLOR: Record<number, string> = {
  1: '#FF453A',
  2: '#FF9F0A',
  3: '#0A84FF',
  4: '#48484A',
};

const PRIORITY_LABEL: Record<number, string> = {
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
};

const MONTHS_SHORT = [
  'янв','фев','мар','апр','май','июн',
  'июл','авг','сен','окт','ноя','дек',
];

// ── Helper utilities ──────────────────────────────────────────────────────────

function sortTasks(tasks: TodoTask[]): TodoTask[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
}

function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < -1) return `${Math.abs(diff)} дн. назад`;
  if (diff === -1) return 'Вчера';
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function isDueDateOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return due < today;
}

function endOfDay(date: Date): string {
  return new Date(
    date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59,
  ).toISOString();
}

function isGuestId(id: string): boolean {
  return id.startsWith('g_');
}

// ── API → unified type converters ─────────────────────────────────────────────

function fromApiTask(t: ApiTask): TodoTask {
  return {
    id: String(t.id),
    project_id: t.project_id !== null ? String(t.project_id) : null,
    section_id: t.section_id !== null ? String(t.section_id) : null,
    title: t.title,
    description: t.description ?? '',
    due_date: t.due_date,
    priority: t.priority as 1 | 2 | 3 | 4,
    is_completed: t.is_completed,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

function fromApiSection(s: ApiSection): import('../storage/todosStorage').TodoSection {
  return {
    id: String(s.id),
    project_id: String(s.project_id),
    name: s.name,
    position: s.position,
    tasks: s.tasks.map(fromApiTask),
  };
}

function fromApiProject(p: ApiProject): TodoProject {
  return {
    id: String(p.id),
    name: p.name,
    color: p.color,
    created_at: p.created_at,
    sections: p.sections.map(fromApiSection),
    inbox_tasks: p.inbox_tasks.map(fromApiTask),
  };
}

function fromApiData(data: ApiTodosData): TodosData {
  return {
    projects: data.projects.map(fromApiProject),
    inbox_tasks: data.inbox_tasks.map(fromApiTask),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const ProjectChip = React.memo(function ProjectChip({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  color?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {color ? (
        <View style={[styles.chipDot, { backgroundColor: color }]} />
      ) : (
        <Ionicons
          name="archive-outline"
          size={12}
          color={selected ? '#fff' : TEXT2}
          style={{ marginRight: 5 }}
        />
      )}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const TaskCard = React.memo(function TaskCard({
  task,
  fading,
  onComplete,
  onDelete,
}: {
  task: TodoTask;
  fading: boolean;
  onComplete: (task: TodoTask) => void;
  onDelete: (task: TodoTask) => void;
}) {
  const priorityColor = PRIORITY_COLOR[task.priority] ?? MUTED;
  const overdue = task.due_date ? isDueDateOverdue(task.due_date) : false;

  return (
    <Animated.View
      style={[
        styles.taskCard,
        { borderLeftColor: priorityColor, opacity: fading ? 0.3 : 1 },
      ]}
    >
      <TouchableOpacity
        onPress={() => onComplete(task)}
        activeOpacity={0.7}
        style={styles.taskCheckbox}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View
          style={[
            styles.checkboxCircle,
            { borderColor: priorityColor },
            fading && { backgroundColor: priorityColor },
          ]}
        >
          {fading && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
      </TouchableOpacity>

      <View style={styles.taskBody}>
        <Text
          style={[
            styles.taskTitle,
            fading && { textDecorationLine: 'line-through', color: MUTED },
          ]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        {!!task.description && (
          <Text style={styles.taskDescription} numberOfLines={1}>
            {task.description}
          </Text>
        )}
        {!!task.due_date && (
          <View style={styles.taskMeta}>
            <Ionicons
              name="calendar-outline"
              size={11}
              color={overdue ? '#FF453A' : TEXT2}
              style={{ marginRight: 3 }}
            />
            <Text
              style={[styles.taskDue, overdue && { color: '#FF453A' }]}
            >
              {formatDueDate(task.due_date)}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => onDelete(task)}
        activeOpacity={0.7}
        style={styles.taskDeleteBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={16} color={MUTED} />
      </TouchableOpacity>
    </Animated.View>
  );
});

// ── Date picker mini-calendar (next 30 days) ──────────────────────────────────

function DatePickerStrip({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (iso: string | null) => void;
}) {
  const days = useMemo(() => {
    const list: Date[] = [];
    for (let i = 0; i < 31; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      list.push(d);
    }
    return list;
  }, []);

  const selectedDay = selected ? new Date(selected) : null;
  const weekDay = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dateStrip}
    >
      {days.map((day, i) => {
        const iso = endOfDay(day);
        const isSelected =
          selectedDay !== null &&
          selectedDay.getDate() === day.getDate() &&
          selectedDay.getMonth() === day.getMonth();

        return (
          <TouchableOpacity
            key={i}
            onPress={() => onSelect(isSelected ? null : iso)}
            activeOpacity={0.75}
            style={[styles.dayCell, isSelected && styles.dayCellSelected]}
          >
            <Text style={[styles.dayName, isSelected && styles.dayCellTextSelected]}>
              {weekDay[day.getDay()]}
            </Text>
            <Text style={[styles.dayNum, isSelected && styles.dayCellTextSelected]}>
              {day.getDate()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Create Task Modal ─────────────────────────────────────────────────────────

interface CreateTaskModalProps {
  visible: boolean;
  projects: TodoProject[];
  defaultProjectId: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    description: string;
    project_id: string | null;
    section_id: string | null;
    due_date: string | null;
    priority: 1 | 2 | 3 | 4;
  }) => void;
}

function CreateTaskModal({
  visible,
  projects,
  defaultProjectId,
  onClose,
  onSubmit,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(4);
  const [dueDate, setDueDate] = useState<string | null>(null);

  // Keep projectId in sync with caller's default
  useEffect(() => {
    setProjectId(defaultProjectId);
  }, [defaultProjectId, visible]);

  // Reset section when project changes
  useEffect(() => {
    setSectionId(null);
  }, [projectId]);

  const selectedProject = projects.find(p => p.id === projectId) ?? null;

  const handleQuickDate = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const iso = endOfDay(d);
    setDueDate(prev => prev === iso ? null : iso);
  };

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Укажите название задачи');
      return;
    }
    onSubmit({ title: trimmed, description, project_id: projectId, section_id: sectionId, due_date: dueDate, priority });
    // Reset
    setTitle('');
    setDescription('');
    setPriority(4);
    setDueDate(null);
  };

  const isQuick = (offset: number) => {
    if (!dueDate) return false;
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const candidate = new Date(dueDate);
    return (
      candidate.getDate() === d.getDate() &&
      candidate.getMonth() === d.getMonth()
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalSheet}
      >
        {/* Handle */}
        <View style={styles.modalHandle} />

        <Text style={styles.modalTitle}>Новая задача</Text>

        {/* Title */}
        <TextInput
          style={styles.modalInput}
          placeholder="Название задачи"
          placeholderTextColor={MUTED}
          value={title}
          onChangeText={setTitle}
          autoFocus
          returnKeyType="next"
        />

        {/* Description */}
        <TextInput
          style={[styles.modalInput, styles.modalInputMulti]}
          placeholder="Описание (необязательно)"
          placeholderTextColor={MUTED}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Project selector */}
        <Text style={styles.modalSectionLabel}>Проект</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modalChipRow}
        >
          <TouchableOpacity
            onPress={() => setProjectId(null)}
            style={[styles.modalChip, projectId === null && styles.modalChipActive]}
          >
            <Text style={[styles.modalChipText, projectId === null && styles.modalChipTextActive]}>
              Входящие
            </Text>
          </TouchableOpacity>
          {projects.map(p => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setProjectId(p.id)}
              style={[styles.modalChip, projectId === p.id && styles.modalChipActive]}
            >
              <View style={[styles.chipDot, { backgroundColor: p.color, marginRight: 5 }]} />
              <Text style={[styles.modalChipText, projectId === p.id && styles.modalChipTextActive]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Section selector */}
        {selectedProject && selectedProject.sections.length > 0 && (
          <>
            <Text style={styles.modalSectionLabel}>Раздел</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modalChipRow}
            >
              <TouchableOpacity
                onPress={() => setSectionId(null)}
                style={[styles.modalChip, sectionId === null && styles.modalChipActive]}
              >
                <Text style={[styles.modalChipText, sectionId === null && styles.modalChipTextActive]}>
                  Без раздела
                </Text>
              </TouchableOpacity>
              {selectedProject.sections.map(s => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSectionId(s.id)}
                  style={[styles.modalChip, sectionId === s.id && styles.modalChipActive]}
                >
                  <Text style={[styles.modalChipText, sectionId === s.id && styles.modalChipTextActive]}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Priority */}
        <Text style={styles.modalSectionLabel}>Приоритет</Text>
        <View style={styles.priorityRow}>
          {([1, 2, 3, 4] as const).map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => setPriority(p)}
              activeOpacity={0.8}
              style={[
                styles.priorityBtn,
                {
                  backgroundColor:
                    priority === p ? PRIORITY_COLOR[p] : 'transparent',
                  borderColor: PRIORITY_COLOR[p],
                },
              ]}
            >
              <Text
                style={[
                  styles.priorityBtnText,
                  { color: priority === p ? '#fff' : PRIORITY_COLOR[p] },
                ]}
              >
                {PRIORITY_LABEL[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Due date */}
        <Text style={styles.modalSectionLabel}>Дедлайн</Text>
        <View style={styles.quickDateRow}>
          {[
            { label: 'Сегодня', offset: 0 },
            { label: 'Завтра', offset: 1 },
            { label: 'Неделя', offset: 7 },
          ].map(({ label, offset }) => (
            <TouchableOpacity
              key={label}
              onPress={() => handleQuickDate(offset)}
              activeOpacity={0.8}
              style={[
                styles.quickDateBtn,
                isQuick(offset) && styles.quickDateBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.quickDateBtnText,
                  isQuick(offset) && styles.quickDateBtnTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Mini date calendar */}
        <DatePickerStrip selected={dueDate} onSelect={setDueDate} />

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          activeOpacity={0.85}
          style={styles.modalSubmitBtn}
        >
          <Text style={styles.modalSubmitText}>Добавить задачу</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TodoScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const prevToken = useRef<string | null>(null);

  const [data, setData] = useState<TodosData>(emptyTodosData());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('inbox');
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadFromServer = useCallback(async (tok: string) => {
    try {
      const raw = await fetchTodosData(tok);
      setData(fromApiData(raw));
    } catch (e) {
      if (!isSessionExpired(e)) {
        Alert.alert('Ошибка', 'Не удалось загрузить задачи');
      }
    }
  }, []);

  const loadFromLocal = useCallback(async () => {
    const stored = await loadGuestTodos();
    setData(stored);
  }, []);

  const loadData = useCallback(async () => {
    if (token) {
      await loadFromServer(token);
    } else {
      await loadFromLocal();
    }
  }, [token, loadFromServer, loadFromLocal]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    loadData().finally(() => setIsLoading(false));
  }, []);

  // Auth change: when the user logs in, sync guest data to server then reload
  useEffect(() => {
    const wasGuest = !prevToken.current;
    const isNowAuth = !!token;

    if (wasGuest && isNowAuth) {
      syncGuestToServer(token!);
    } else if (!isNowAuth && prevToken.current) {
      // Logged out → load from local
      loadFromLocal();
    }
    prevToken.current = token;
  }, [token]);

  // ── Guest → server sync ───────────────────────────────────────────────────

  const syncGuestToServer = async (tok: string) => {
    try {
      const guest = await loadGuestTodos();
      const hasData =
        guest.projects.length > 0 || guest.inbox_tasks.length > 0;
      if (!hasData) {
        await loadFromServer(tok);
        return;
      }

      for (const project of guest.projects) {
        try {
          const sp = await apiCreateProject(tok, project.name, project.color);
          for (const section of project.sections) {
            try {
              const ss = await apiCreateSection(tok, sp.id, section.name, section.position);
              for (const task of section.tasks) {
                await apiCreateTask(tok, {
                  title: task.title,
                  description: task.description,
                  project_id: sp.id,
                  section_id: ss.id,
                  due_date: task.due_date,
                  priority: task.priority,
                }).catch(() => {});
              }
            } catch {}
          }
          for (const task of project.inbox_tasks) {
            await apiCreateTask(tok, {
              title: task.title,
              description: task.description,
              project_id: sp.id,
              due_date: task.due_date,
              priority: task.priority,
            }).catch(() => {});
          }
        } catch {}
      }

      for (const task of guest.inbox_tasks) {
        await apiCreateTask(tok, {
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          priority: task.priority,
        }).catch(() => {});
      }

      await clearGuestTodos();
      await loadFromServer(tok);
    } catch (e) {
      console.warn('[Todos] Guest sync failed:', e);
      await loadFromServer(tok);
    }
  };

  // ── CRUD operations ───────────────────────────────────────────────────────

  const handleCreateTask = useCallback(
    async (payload: {
      title: string;
      description: string;
      project_id: string | null;
      section_id: string | null;
      due_date: string | null;
      priority: 1 | 2 | 3 | 4;
    }) => {
      setModalVisible(false);

      if (token) {
        // Authenticated: call API, add result to state
        try {
          const created = await apiCreateTask(token, {
            title: payload.title,
            description: payload.description,
            project_id: payload.project_id ? Number(payload.project_id) : null,
            section_id: payload.section_id ? Number(payload.section_id) : null,
            due_date: payload.due_date,
            priority: payload.priority,
          } as TaskCreatePayload);
          setData(prev => addTaskToTree(prev, fromApiTask(created)));
        } catch (e) {
          if (!isSessionExpired(e)) {
            Alert.alert('Ошибка', 'Не удалось создать задачу');
          }
        }
      } else {
        // Guest: create locally
        const now = new Date().toISOString();
        const newTask: TodoTask = {
          id: guestId(),
          project_id: payload.project_id,
          section_id: payload.section_id,
          title: payload.title,
          description: payload.description,
          due_date: payload.due_date,
          priority: payload.priority,
          is_completed: false,
          created_at: now,
          updated_at: now,
        };
        setData(prev => {
          const next = addTaskToTree(prev, newTask);
          saveGuestTodos(next).catch(() => {});
          return next;
        });
      }
    },
    [token],
  );

  const handleCompleteTask = useCallback(
    (task: TodoTask) => {
      if (completingIds.has(task.id)) return;

      // Start fade animation
      setCompletingIds(prev => new Set([...prev, task.id]));

      // After 450ms: remove from tree
      setTimeout(() => {
        setData(prev => {
          const next = removeTaskFromTree(prev, task.id);
          if (!token) saveGuestTodos(next).catch(() => {});
          return next;
        });
        setCompletingIds(prev => {
          const s = new Set(prev);
          s.delete(task.id);
          return s;
        });
      }, 450);

      // Fire API or update local storage
      if (token && !isGuestId(task.id)) {
        apiUpdateTask(token, Number(task.id), {
          is_completed: !task.is_completed,
        }).catch(e => {
          if (!isSessionExpired(e)) {
            console.warn('[Todos] Failed to complete task:', e);
          }
        });
      }
    },
    [token, completingIds],
  );

  const handleDeleteTask = useCallback(
    (task: TodoTask) => {
      Alert.alert('Удалить задачу?', task.title, [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            setData(prev => {
              const next = removeTaskFromTree(prev, task.id);
              if (!token) saveGuestTodos(next).catch(() => {});
              return next;
            });
            if (token && !isGuestId(task.id)) {
              apiDeleteTask(token, Number(task.id)).catch(e => {
                if (!isSessionExpired(e)) {
                  console.warn('[Todos] Failed to delete task:', e);
                }
              });
            }
          },
        },
      ]);
    },
    [token],
  );

  // ── Derived data for selected project ─────────────────────────────────────

  const currentProject =
    selectedProjectId !== 'inbox'
      ? data.projects.find(p => p.id === selectedProjectId) ?? null
      : null;

  const defaultModalProjectId =
    selectedProjectId !== 'inbox' ? selectedProjectId : null;

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderTaskList = (tasks: TodoTask[], emptyHint?: string) => {
    const sorted = sortTasks(tasks);
    if (sorted.length === 0 && emptyHint) {
      return <Text style={styles.emptyHint}>{emptyHint}</Text>;
    }
    return sorted.map(t => (
      <TaskCard
        key={t.id}
        task={t}
        fading={completingIds.has(t.id)}
        onComplete={handleCompleteTask}
        onDelete={handleDeleteTask}
      />
    ));
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#0A84FF" size="large" />
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Список дел</Text>
      </View>

      {/* Project chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
        style={styles.chipsScroll}
      >
        <ProjectChip
          label="Входящие"
          selected={selectedProjectId === 'inbox'}
          onPress={() => setSelectedProjectId('inbox')}
        />
        {data.projects.map(p => (
          <ProjectChip
            key={p.id}
            label={p.name}
            color={p.color}
            selected={selectedProjectId === p.id}
            onPress={() => setSelectedProjectId(p.id)}
          />
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentInner,
          { paddingBottom: tabBarHeight + 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {selectedProjectId === 'inbox' ? (
          /* ── Global inbox ── */
          data.inbox_tasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkbox-outline" size={56} color={MUTED} />
              <Text style={styles.emptyTitle}>Нет задач</Text>
              <Text style={styles.emptySubtitle}>
                Нажми «+», чтобы добавить задачу во входящие
              </Text>
            </View>
          ) : (
            renderTaskList(data.inbox_tasks)
          )
        ) : currentProject ? (
          /* ── Project view ── */
          <>
            {/* Tasks without section */}
            {currentProject.inbox_tasks.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="list-outline" size={14} color={MUTED} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionName}>БЕЗ РАЗДЕЛА</Text>
                </View>
                {renderTaskList(currentProject.inbox_tasks)}
              </View>
            )}

            {/* Sections */}
            {currentProject.sections.length === 0 &&
              currentProject.inbox_tasks.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="folder-open-outline" size={56} color={MUTED} />
                  <Text style={styles.emptyTitle}>Проект пуст</Text>
                  <Text style={styles.emptySubtitle}>
                    Добавь первую задачу через «+»
                  </Text>
                </View>
              )}

            {currentProject.sections.map(section => (
              <View key={section.id} style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <View
                    style={[
                      styles.sectionDot,
                      { backgroundColor: currentProject.color },
                    ]}
                  />
                  <Text style={styles.sectionName}>
                    {section.name.toUpperCase()}
                  </Text>
                </View>
                {renderTaskList(
                  section.tasks,
                  'В этом разделе нет активных задач',
                )}
              </View>
            ))}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Проект не найден</Text>
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
        style={[styles.fab, { bottom: tabBarHeight + 16 }]}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create Task Modal */}
      <CreateTaskModal
        visible={modalVisible}
        projects={data.projects}
        defaultProjectId={defaultModalProjectId}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreateTask}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: 0.2,
  },
  // ── Project chips ─────────────────────────────────────────────────────────
  chipsScroll: {
    flexGrow: 0,
    marginTop: 10,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipSelected: {
    backgroundColor: '#0A84FF',
    borderColor: '#0A84FF',
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT2,
  },
  chipLabelSelected: {
    color: '#fff',
  },

  // ── Content ───────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    marginTop: 10,
  },
  contentInner: {
    paddingHorizontal: 16,
  },

  // ── Section block ─────────────────────────────────────────────────────────
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  sectionName: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1.2,
  },

  // ── Task card ─────────────────────────────────────────────────────────────
  taskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: CARD2,
    borderRadius: 12,
    borderLeftWidth: 3,
    padding: 12,
    marginBottom: 8,
  },
  taskCheckbox: {
    marginTop: 2,
    marginRight: 12,
  },
  checkboxCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskBody: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT,
    lineHeight: 20,
  },
  taskDescription: {
    fontSize: 12,
    color: TEXT2,
    marginTop: 3,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  taskDue: {
    fontSize: 11,
    color: TEXT2,
  },
  taskDeleteBtn: {
    marginLeft: 8,
    padding: 2,
    marginTop: 2,
  },

  // ── Empty states ──────────────────────────────────────────────────────────
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: TEXT2,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: MUTED,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 20,
  },
  emptyHint: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A84FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '88%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#48484A',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: CARD2,
    borderRadius: 10,
    padding: 12,
    color: TEXT,
    fontSize: 15,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  modalInputMulti: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 8,
  },
  modalChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
    paddingBottom: 4,
  },
  modalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD2,
  },
  modalChipActive: {
    borderColor: '#0A84FF',
    backgroundColor: 'rgba(10,132,255,0.18)',
  },
  modalChipText: {
    fontSize: 13,
    color: TEXT2,
  },
  modalChipTextActive: {
    color: '#64B5FF',
    fontWeight: '600',
  },

  // ── Priority ──────────────────────────────────────────────────────────────
  priorityRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  priorityBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Quick dates ───────────────────────────────────────────────────────────
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quickDateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD2,
  },
  quickDateBtnActive: {
    borderColor: '#0A84FF',
    backgroundColor: 'rgba(10,132,255,0.18)',
  },
  quickDateBtnText: {
    fontSize: 13,
    color: TEXT2,
  },
  quickDateBtnTextActive: {
    color: '#64B5FF',
    fontWeight: '600',
  },

  // ── Date strip ────────────────────────────────────────────────────────────
  dateStrip: {
    gap: 6,
    paddingBottom: 10,
  },
  dayCell: {
    width: 44,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD2,
    alignItems: 'center',
  },
  dayCellSelected: {
    borderColor: '#0A84FF',
    backgroundColor: '#0A84FF',
  },
  dayName: {
    fontSize: 10,
    color: MUTED,
    fontWeight: '600',
    marginBottom: 2,
  },
  dayNum: {
    fontSize: 15,
    color: TEXT,
    fontWeight: '600',
  },
  dayCellTextSelected: {
    color: '#fff',
  },

  // ── Submit button ─────────────────────────────────────────────────────────
  modalSubmitBtn: {
    backgroundColor: '#0A84FF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  modalSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
