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
  apiUpdateSection,
  apiUpdateTask,
  type ApiProject,
  type ApiSection,
  type ApiTask,
  type ApiTodosData,
} from '../api/todosApi';
import {
  addTaskToTree,
  clearGuestTodos,
  emptyTodosData,
  guestId,
  loadGuestTodos,
  removeTaskFromTree,
  saveGuestTodos,
  updateTaskInTree,
  type TodoProject,
  type TodoSection,
  type TodosData,
  type TodoTask,
} from '../storage/todosStorage';
import { CalendarView } from '../components/todos/CalendarView';
import { CreateTaskModal, type CreateTaskPayload } from '../components/todos/CreateTaskModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const BG     = '#17161B';
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
  1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4',
};
const MONTHS_SHORT = [
  'янв','фев','мар','апр','май','июн',
  'июл','авг','сен','окт','ноя','дек',
];

// ── View mode ─────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'calendar';

// ── Metric filter ─────────────────────────────────────────────────────────────

/**
 * Ключ активного фильтра дашборда.
 * null = нет фильтра, задачи отображаются в обычной проектной структуре.
 */
type MetricFilter = 'total' | 'in_progress' | 'today' | 'completed';

interface MetricsData {
  total:       number; // Все задачи в области видимости
  in_progress: number; // !is_completed
  today:       number; // due_date или schedule_date == сегодня
  completed:   number; // is_completed === true
}

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
  const pad = (n: number) => String(n).padStart(2, '0');
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  const datePart = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  const timePart = hasTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  return datePart + timePart;
}

function isDueDateOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return due < today;
}

function isGuestId(id: string): boolean { return id.startsWith('g_'); }

// ── API → unified type converters ─────────────────────────────────────────────

function fromApiTask(t: ApiTask): TodoTask {
  return {
    id: String(t.id),
    project_id: t.project_id !== null ? String(t.project_id) : null,
    section_id: t.section_id !== null ? String(t.section_id) : null,
    title: t.title,
    description: t.description ?? '',
    due_date: t.due_date,
    schedule_date: t.schedule_date ?? null,
    duration_minutes: t.duration_minutes ?? 30,
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
    // Фильтруем виртуальный «all_tasks» — он строится на клиенте через displayedProjects,
    // чтобы не загрязнять data-стейт дублирующимися задачами и не ломать сохранения.
    projects: data.projects
      .filter(p => String(p.id) !== 'all_tasks')
      .map(fromApiProject),
    inbox_tasks: data.inbox_tasks.map(fromApiTask),
  };
}

/** Flatten all tasks from the entire data tree (for calendar view). */
function flattenAllTasks(data: TodosData): TodoTask[] {
  const tasks: TodoTask[] = [...data.inbox_tasks];
  for (const project of data.projects) {
    tasks.push(...project.inbox_tasks);
    for (const section of project.sections) {
      tasks.push(...section.tasks);
    }
  }
  return tasks;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const ProjectChip = React.memo(function ProjectChip({
  label, color, selected, onPress,
}: {
  label: string; color?: string; selected: boolean; onPress: () => void;
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
        <Ionicons name="archive-outline" size={12} color={selected ? '#fff' : TEXT2} style={{ marginRight: 5 }} />
      )}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
});

const TaskCard = React.memo(function TaskCard({
  task, fading, onComplete, onDelete, onEdit,
}: {
  task: TodoTask; fading: boolean;
  onComplete: (task: TodoTask) => void;
  onDelete: (task: TodoTask) => void;
  onEdit: (task: TodoTask) => void;
}) {
  const priorityColor = PRIORITY_COLOR[task.priority] ?? MUTED;
  const overdue = task.due_date ? isDueDateOverdue(task.due_date) : false;

  return (
    <Animated.View style={[styles.taskCard, { borderLeftColor: priorityColor, opacity: fading ? 0.3 : 1 }]}>
      <TouchableOpacity
        onPress={() => onComplete(task)}
        activeOpacity={0.7}
        style={styles.taskCheckbox}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[styles.checkboxCircle, { borderColor: priorityColor }, fading && { backgroundColor: priorityColor }]}>
          {fading && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
      </TouchableOpacity>

      {/* Tappable body → open edit modal */}
      <TouchableOpacity style={styles.taskBody} activeOpacity={0.7} onPress={() => onEdit(task)}>
        <Text style={[styles.taskTitle, fading && { textDecorationLine: 'line-through', color: MUTED }]} numberOfLines={2}>
          {task.title}
        </Text>
        {!!task.description && (
          <Text style={styles.taskDescription} numberOfLines={1}>{task.description}</Text>
        )}

        {/* Date indicators */}
        <View style={styles.taskMeta}>
          {!!task.due_date && (
            <View style={styles.taskDateRow}>
              <Ionicons name="alarm-outline" size={11} color={overdue ? '#FF453A' : TEXT2} style={{ marginRight: 3 }} />
              <Text style={[styles.taskDue, overdue && { color: '#FF453A' }]}>
                {formatDueDate(task.due_date)}
              </Text>
            </View>
          )}
          {!!task.schedule_date && (
            <View style={styles.taskDateRow}>
              <Ionicons name="calendar-outline" size={11} color="#0A84FF" style={{ marginRight: 3 }} />
              <Text style={[styles.taskDue, { color: '#0A84FF' }]}>
                {formatDueDate(task.schedule_date)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.taskRight}>
        <Text style={[styles.priorityBadge, { color: PRIORITY_COLOR[task.priority] }]}>
          {PRIORITY_LABEL[task.priority]}
        </Text>
        <TouchableOpacity
          onPress={() => onDelete(task)}
          activeOpacity={0.7}
          style={styles.taskDeleteBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={15} color={MUTED} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

// ── Metrics dashboard ─────────────────────────────────────────────────────────

const METRIC_CONFIG: Array<{
  key:    MetricFilter;
  label:  string;
  icon:   React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
}> = [
  { key: 'total',       label: 'Всего дел',  icon: 'layers-outline',           accent: '#8E8E93' },
  { key: 'in_progress', label: 'В работе',   icon: 'time-outline',             accent: '#0A84FF' },
  { key: 'today',       label: 'На сегодня', icon: 'calendar-outline',         accent: '#FF9F0A' },
  { key: 'completed',   label: 'Выполнено',  icon: 'checkmark-circle-outline', accent: '#30D158' },
];

/**
 * MetricsBlock — горизонтальная строка из 4 интерактивных карточек-метрик.
 *
 * Каждая карточка:
 *  - Круглая иконка в тон акцентному цвету
 *  - Крупное число (значение метрики)
 *  - Мелкий подзаголовок
 *
 * Тап по карточке активирует фильтр (список задач фильтруется по этому критерию).
 * Повторный тап по активной карточке снимает фильтр.
 * Рамка карточки подсвечивается акцентным цветом при активации.
 */
const MetricsBlock = React.memo(function MetricsBlock({
  metrics,
  activeFilter,
  onFilter,
}: {
  metrics:      MetricsData;
  activeFilter: MetricFilter;
  onFilter:     (f: MetricFilter) => void;
}) {
  const values: Record<MetricFilter, number> = {
    total:       metrics.total,
    in_progress: metrics.in_progress,
    today:       metrics.today,
    completed:   metrics.completed,
  };

  return (
    <View style={metricStyles.row}>
      {METRIC_CONFIG.map(cfg => {
        const isActive = activeFilter === cfg.key;
        return (
          <TouchableOpacity
            key={cfg.key}
            activeOpacity={0.72}
            onPress={() => onFilter(cfg.key)}
            style={[metricStyles.card, isActive && { borderColor: cfg.accent }]}
          >
            {/* Иконка в цветном кружке */}
            <View style={[metricStyles.iconCircle, { backgroundColor: `${cfg.accent}22` }]}>
              <Ionicons name={cfg.icon} size={15} color={cfg.accent} />
            </View>
            {/* Крупное значение */}
            <Text style={[metricStyles.value, isActive && { color: cfg.accent }]}>
              {values[cfg.key]}
            </Text>
            {/* Подпись */}
            <Text style={metricStyles.label} numberOfLines={2}>
              {cfg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const metricStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
    gap: 8,
  },
  card: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 4,
    // Прозрачная рамка всегда — исключает прыжок размера при активации
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  iconCircle: {
    width: 30, height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  value: {
    fontSize: 21,
    fontWeight: '800',
    color: TEXT,
    lineHeight: 26,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: TEXT2,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 12,
    paddingHorizontal: 2,
  },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TodoScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const prevToken = useRef<string | null>(null);

  const [data, setData]                     = useState<TodosData>(emptyTodosData());
  const [isLoading, setIsLoading]           = useState(true);
  // По умолчанию показываем «Все задачи» — виртуальный проект, агрегирующий всё.
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all_tasks');
  const [completingIds, setCompletingIds]   = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible]     = useState(false);
  const [editingTask, setEditingTask]       = useState<TodoTask | null>(null);
  const [viewMode, setViewMode]             = useState<ViewMode>('list');
  /** «Всего дел» активна по умолчанию; при смене проекта — возврат к ней. */
  const [metricFilter, setMetricFilter]     = useState<MetricFilter>('total');

  // Возврат к «Всего дел» при смене проекта
  useEffect(() => { setMetricFilter('total'); }, [selectedProjectId]);

  // ── Section management state ──────────────────────────────────────────────
  const [managingSection, setManagingSection] = useState<{
    section: TodoSection;
    project: TodoProject;
  } | null>(null);
  const [sectionNewName,  setSectionNewName]  = useState('');
  const [mergeTargetId,   setMergeTargetId]   = useState<string | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadFromServer = useCallback(async (tok: string) => {
    try {
      const raw = await (await import('../api/todosApi')).fetchTodosData(tok);
      setData(fromApiData(raw));
    } catch (e) {
      if (!isSessionExpired(e)) Alert.alert('Ошибка', 'Не удалось загрузить задачи');
    }
  }, []);

  const loadFromLocal = useCallback(async () => {
    const stored = await loadGuestTodos();
    setData(stored);
  }, []);

  const loadData = useCallback(async () => {
    if (token) await loadFromServer(token);
    else await loadFromLocal();
  }, [token, loadFromServer, loadFromLocal]);

  useEffect(() => {
    setIsLoading(true);
    loadData().finally(() => setIsLoading(false));
  }, []);

  // Auth change: sync guest data → server
  useEffect(() => {
    const wasGuest = !prevToken.current;
    const isNowAuth = !!token;
    if (wasGuest && isNowAuth) syncGuestToServer(token!);
    else if (!isNowAuth && prevToken.current) loadFromLocal();
    prevToken.current = token;
  }, [token]);

  // ── Guest → server sync ────────────────────────────────────────────────────

  const syncGuestToServer = async (tok: string) => {
    try {
      const guest = await loadGuestTodos();
      const hasData = guest.projects.length > 0 || guest.inbox_tasks.length > 0;
      if (!hasData) { await loadFromServer(tok); return; }

      for (const project of guest.projects) {
        try {
          const sp = await apiCreateProject(tok, project.name, project.color);
          const spId = Number(sp.id);
          for (const section of project.sections) {
            try {
              const ss = await apiCreateSection(tok, spId, section.name, section.position);
              for (const task of section.tasks) {
                await apiCreateTask(tok, {
                  title: task.title, description: task.description,
                  project_id: spId, section_id: ss.id,
                  due_date: task.due_date, schedule_date: task.schedule_date,
                  duration_minutes: task.duration_minutes,
                  priority: task.priority,
                }).catch(() => {});
              }
            } catch {}
          }
          for (const task of project.inbox_tasks) {
            await apiCreateTask(tok, {
              title: task.title, description: task.description, project_id: spId,
              due_date: task.due_date, schedule_date: task.schedule_date,
              duration_minutes: task.duration_minutes,
              priority: task.priority,
            }).catch(() => {});
          }
        } catch {}
      }
      for (const task of guest.inbox_tasks) {
        await apiCreateTask(tok, {
          title: task.title, description: task.description,
          due_date: task.due_date, schedule_date: task.schedule_date,
          duration_minutes: task.duration_minutes,
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

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const handleCreateTask = useCallback(async (payload: CreateTaskPayload) => {
    setModalVisible(false);

    if (token) {
      // ── Authenticated path ────────────────────────────────────────────────
      try {
        const created = await apiCreateTask(token, {
          title: payload.title,
          description: payload.description,
          // Pass as-is: backend validator handles int | string
          project_id: payload.project_id,
          section_id: payload.section_id,
          due_date: payload.due_date,
          schedule_date: payload.schedule_date,
          duration_minutes: payload.duration_minutes,
          priority: payload.priority,
        });

        const newTask = fromApiTask(created);
        setData(prev => addTaskToTree(prev, newTask));

        // If backend created a new project/section, reload the full tree to get the new IDs
        if (typeof payload.project_id === 'string' || typeof payload.section_id === 'string') {
          await loadFromServer(token);
        }
      } catch (e) {
        if (!isSessionExpired(e)) Alert.alert('Ошибка', 'Не удалось создать задачу');
      }
    } else {
      // ── Guest path ────────────────────────────────────────────────────────
      const now = new Date().toISOString();

      let finalProjectId: string | null = null;
      let finalSectionId: string | null = null;

      // Handle on-the-fly project creation for guest
      if (typeof payload.project_id === 'number') {
        finalProjectId = String(payload.project_id);
      } else if (typeof payload.project_id === 'string') {
        // Create a guest project in local state
        const newProject: TodoProject = {
          id: guestId(),
          name: payload.project_id,
          color: '#6366f1',
          created_at: now,
          sections: [],
          inbox_tasks: [],
        };
        setData(prev => ({ ...prev, projects: [...prev.projects, newProject] }));
        finalProjectId = newProject.id;

        // Handle on-the-fly section inside new project
        if (typeof payload.section_id === 'string') {
          const newSection = {
            id: guestId(),
            project_id: newProject.id,
            name: payload.section_id,
            position: 0,
            tasks: [],
          };
          setData(prev => ({
            ...prev,
            projects: prev.projects.map(p =>
              p.id === newProject.id
                ? { ...p, sections: [...p.sections, newSection] }
                : p,
            ),
          }));
          finalSectionId = newSection.id;
        }
      }

      // Handle section in existing project
      if (finalProjectId && typeof payload.section_id === 'string' && !finalSectionId) {
        const newSection = {
          id: guestId(),
          project_id: finalProjectId,
          name: payload.section_id,
          position: 0,
          tasks: [],
        };
        setData(prev => ({
          ...prev,
          projects: prev.projects.map(p =>
            p.id === finalProjectId
              ? { ...p, sections: [...p.sections, newSection] }
              : p,
          ),
        }));
        finalSectionId = newSection.id;
      } else if (typeof payload.section_id === 'number') {
        finalSectionId = String(payload.section_id);
      }

      const newTask: TodoTask = {
        id: guestId(),
        project_id: finalProjectId,
        section_id: finalSectionId,
        title: payload.title,
        description: payload.description,
        due_date: payload.due_date,
        schedule_date: payload.schedule_date,
        duration_minutes: payload.duration_minutes,
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
  }, [token, loadFromServer]);

  const handleOpenEdit = useCallback((task: TodoTask) => {
    setEditingTask(task);
    setModalVisible(true);
  }, []);

  const handleEditTask = useCallback(async (payload: CreateTaskPayload) => {
    if (!editingTask) return;
    setModalVisible(false);
    const taskId = Number(editingTask.id);

    if (token && !isGuestId(editingTask.id)) {
      try {
        // ── Resolve project_id ───────────────────────────────────────────────
        // • string → создать новый проект, получить int ID
        // • number → использовать напрямую
        // • null   → не меняем (бэкенд не поддерживает перемещение в Inbox через PUT)
        let resolvedProjectId: number | undefined;
        if (typeof payload.project_id === 'string') {
          const newProj = await apiCreateProject(token, payload.project_id, '#6366f1');
          resolvedProjectId = Number(newProj.id);
        } else if (typeof payload.project_id === 'number') {
          resolvedProjectId = payload.project_id;
        }

        // ── Resolve section_id ───────────────────────────────────────────────
        let resolvedSectionId: number | undefined;
        if (typeof payload.section_id === 'string') {
          const projIdForSection = resolvedProjectId
            ?? (editingTask.project_id ? Number(editingTask.project_id) : null);
          if (projIdForSection) {
            const newSec = await apiCreateSection(token, projIdForSection, payload.section_id);
            resolvedSectionId = newSec.id;
          }
        } else if (typeof payload.section_id === 'number') {
          resolvedSectionId = payload.section_id;
        }

        const updated = await apiUpdateTask(token, taskId, {
          title:            payload.title,
          description:      payload.description,
          due_date:         payload.due_date,
          schedule_date:    payload.schedule_date,
          duration_minutes: payload.duration_minutes,
          priority:         payload.priority,
          ...(resolvedProjectId !== undefined && { project_id: resolvedProjectId }),
          ...(resolvedSectionId !== undefined && { section_id: resolvedSectionId }),
        });

        // Перезагружаем всё дерево, если задача переместилась в другой проект/раздел
        if (resolvedProjectId !== undefined || resolvedSectionId !== undefined) {
          await loadFromServer(token);
        } else {
          setData(prev => updateTaskInTree(prev, fromApiTask(updated)));
        }
      } catch (e) {
        if (!isSessionExpired(e)) Alert.alert('Ошибка', 'Не удалось сохранить задачу');
      }
    } else {
      // Guest edit: обновляем поля задачи на месте (перемещение между проектами не поддерживается)
      const now = new Date().toISOString();
      const updated: TodoTask = {
        ...editingTask,
        title:            payload.title,
        description:      payload.description,
        due_date:         payload.due_date,
        schedule_date:    payload.schedule_date,
        duration_minutes: payload.duration_minutes,
        priority:         payload.priority,
        updated_at:       now,
      };
      setData(prev => {
        const next = updateTaskInTree(prev, updated);
        saveGuestTodos(next).catch(() => {});
        return next;
      });
    }

    setEditingTask(null);
  }, [editingTask, token, loadFromServer]);

  const handleCompleteTask = useCallback((task: TodoTask) => {
    if (completingIds.has(task.id)) return;
    setCompletingIds(prev => new Set([...prev, task.id]));

    setTimeout(() => {
      setData(prev => {
        const next = removeTaskFromTree(prev, task.id);
        if (!token) saveGuestTodos(next).catch(() => {});
        return next;
      });
      setCompletingIds(prev => { const s = new Set(prev); s.delete(task.id); return s; });
    }, 450);

    if (token && !isGuestId(task.id)) {
      apiUpdateTask(token, Number(task.id), { is_completed: !task.is_completed }).catch(e => {
        if (!isSessionExpired(e)) console.warn('[Todos] Failed to complete task:', e);
      });
    }
  }, [token, completingIds]);

  const handleDeleteTask = useCallback((task: TodoTask) => {
    Alert.alert('Удалить задачу?', task.title, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive',
        onPress: () => {
          setData(prev => {
            const next = removeTaskFromTree(prev, task.id);
            if (!token) saveGuestTodos(next).catch(() => {});
            return next;
          });
          if (token && !isGuestId(task.id)) {
            apiDeleteTask(token, Number(task.id)).catch(e => {
              if (!isSessionExpired(e)) console.warn('[Todos] Failed to delete task:', e);
            });
          }
        },
      },
    ]);
  }, [token]);

  // ── Section management ─────────────────────────────────────────────────────

  const handleOpenSectionManager = useCallback((section: TodoSection, project: TodoProject) => {
    setSectionNewName(section.name);
    setMergeTargetId(null);
    setManagingSection({ section, project });
  }, []);

  const handleSectionSave = useCallback(async () => {
    if (!managingSection) return;
    const { section, project } = managingSection;
    setManagingSection(null);

    const trimmedName = sectionNewName.trim();
    const hasRename = !!trimmedName && trimmedName !== section.name;
    const hasMerge  = !!mergeTargetId;

    // Нет реальных изменений → ничего не делаем
    if (!hasRename && !hasMerge) return;

    if (!token) {
      // ── Гостевой путь: обновляем локальный стейт и AsyncStorage ─────────
      setData(prev => {
        const updatedProjects = prev.projects.map(p => {
          if (p.id !== project.id) return p;

          if (hasMerge) {
            // Слияние: задачи источника переносим в целевой раздел, источник удаляем
            const sourceTasks = p.sections.find(s => s.id === section.id)?.tasks ?? [];
            const updatedSections = p.sections
              .filter(s => s.id !== section.id)          // убираем источник
              .map(s => s.id === mergeTargetId
                ? {
                    ...s,
                    ...(hasRename ? { name: trimmedName } : {}),
                    tasks: [...s.tasks, ...sourceTasks],
                  }
                : s,
              );
            return { ...p, sections: updatedSections };
          }

          // Только переименование
          return {
            ...p,
            sections: p.sections.map(s =>
              s.id === section.id ? { ...s, name: trimmedName } : s,
            ),
          };
        });

        const next = { ...prev, projects: updatedProjects };
        saveGuestTodos(next).catch(() => {});
        return next;
      });
      return;
    }

    // ── Авторизованный путь: вызываем API ────────────────────────────────
    try {
      const payload: Parameters<typeof apiUpdateSection>[2] = {};
      if (hasRename) payload.name = trimmedName;
      if (hasMerge)  payload.merge_into_section_id = Number(mergeTargetId);

      await apiUpdateSection(token, Number(section.id), payload);
      await loadFromServer(token);
    } catch (e) {
      if (!isSessionExpired(e)) Alert.alert('Ошибка', 'Не удалось обновить раздел');
    }
  }, [managingSection, sectionNewName, mergeTargetId, token, loadFromServer]);

  // ── Derived data ───────────────────────────────────────────────────────────

  /**
   * Список проектов для рендера чипов и поиска currentProject.
   * Всегда первым идёт виртуальный «Все задачи», который строится из реальных данных.
   * Сам data.projects никогда не содержит виртуальный проект — это предотвращает
   * загрязнение гостевых сохранений в AsyncStorage.
   */
  const displayedProjects = useMemo<TodoProject[]>(() => {
    const allTasksFlat: TodoTask[] = [
      ...data.inbox_tasks,
      ...data.projects.flatMap(p => [
        ...p.inbox_tasks,
        ...p.sections.flatMap(s => s.tasks),
      ]),
    ];
    const virtualAllTasks: TodoProject = {
      id:         'all_tasks',
      name:       'Все задачи',
      color:      '#6366f1',
      created_at: '',
      sections:   [],
      inbox_tasks: allTasksFlat,
    };
    return [virtualAllTasks, ...data.projects];
  }, [data]);

  const currentProject = useMemo(
    () => selectedProjectId !== 'inbox'
      ? displayedProjects.find(p => p.id === selectedProjectId) ?? null
      : null,
    [selectedProjectId, displayedProjects],
  );

  const allTasks = useMemo(() => flattenAllTasks(data), [data]);

  // ── Метрики дашборда ──────────────────────────────────────────────────────

  /**
   * Плоский список задач в рамках выбранного проекта / inbox.
   * Для «all_tasks» — все задачи пользователя.
   */
  const scopedTasks = useMemo<TodoTask[]>(() => {
    if (selectedProjectId === 'inbox') return data.inbox_tasks;
    const proj = displayedProjects.find(p => p.id === selectedProjectId);
    if (!proj) return [];
    return [
      ...proj.inbox_tasks,
      ...proj.sections.flatMap(s => s.tasks),
    ];
  }, [selectedProjectId, data.inbox_tasks, displayedProjects]);

  /** 4 метрики для дашборда, пересчитываемые при любом изменении данных */
  const metrics = useMemo<MetricsData>(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const inToday = (dateStr: string | null | undefined): boolean => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= todayStart && d < todayEnd;
    };

    return {
      total:       scopedTasks.length,
      in_progress: scopedTasks.filter(t => !t.is_completed).length,
      today:       scopedTasks.filter(t => inToday(t.due_date) || inToday(t.schedule_date)).length,
      completed:   scopedTasks.filter(t => t.is_completed).length,
    };
  }, [scopedTasks]);

  /**
   * Задачи из области видимости, отфильтрованные по активной метрике.
   * Используется для плоского вида, когда фильтр активен.
   */
  const filteredScopedTasks = useMemo<TodoTask[]>(() => {
    if (!metricFilter) return scopedTasks;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const inToday = (s: string | null | undefined) => {
      if (!s) return false;
      const d = new Date(s);
      return d >= todayStart && d < todayEnd;
    };

    switch (metricFilter) {
      case 'total':       return scopedTasks;
      case 'in_progress': return scopedTasks.filter(t => !t.is_completed);
      case 'today':       return scopedTasks.filter(t => inToday(t.due_date) || inToday(t.schedule_date));
      case 'completed':   return scopedTasks.filter(t => t.is_completed);
      default:            return scopedTasks;
    }
  }, [scopedTasks, metricFilter]);

  // «all_tasks» — виртуальный, не передаём его в модалку создания/редактирования задачи
  const defaultModalProjectId =
    selectedProjectId !== 'inbox' && selectedProjectId !== 'all_tasks'
      ? selectedProjectId
      : null;

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
        onEdit={handleOpenEdit}
      />
    ));
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#0A84FF" size="large" />
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/*
       * ── Header ────────────────────────────────────────────────────────────
       *
       * Двухрядная структура намеренно разделяет заголовок и переключатель:
       *
       *   Строка 1 (headerTitleRow): "Список дел" — занимает полную ширину.
       *     StatusIndicator (position: absolute) накрывает пустое пространство
       *     справа от заголовка — не перекрывает никакие кнопки.
       *
       *   Строка 2 (headerControlsRow): переключатель Список / Календарь.
       *     Находится ниже нижней границы StatusIndicator — полностью свободен.
       *
       * paddingTop: 10 даёт дополнительный зазор от статус-бара.
       */}
      <View style={styles.header}>

        {/* Строка 1: заголовок — полная ширина, StatusIndicator не мешает */}
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Список дел</Text>
        </View>

        {/* Строка 2: переключатель режимов — ниже StatusIndicator badge */}
        <View style={styles.headerControlsRow}>
          <View style={styles.modeToggle}>
            <Pressable
              onPress={() => setViewMode('list')}
              style={[styles.modeBtn, viewMode === 'list' && styles.modeBtnActive]}
            >
              <Ionicons
                name={viewMode === 'list' ? 'list' : 'list-outline'}
                size={16}
                color={viewMode === 'list' ? '#fff' : TEXT2}
              />
              <Text style={[styles.modeBtnLabel, viewMode === 'list' && styles.modeBtnLabelActive]}>
                Список
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setViewMode('calendar')}
              style={[styles.modeBtn, viewMode === 'calendar' && styles.modeBtnActive]}
            >
              <Ionicons
                name={viewMode === 'calendar' ? 'calendar' : 'calendar-outline'}
                size={16}
                color={viewMode === 'calendar' ? '#fff' : TEXT2}
              />
              <Text style={[styles.modeBtnLabel, viewMode === 'calendar' && styles.modeBtnLabelActive]}>
                Календарь
              </Text>
            </Pressable>
          </View>
        </View>

      </View>

      {/* ── Calendar mode ────────────────────────────────────────────────── */}
      {viewMode === 'calendar' ? (
        <CalendarView
          tasks={allTasks}
          projects={data.projects}
          tabBarHeight={tabBarHeight}
          onTaskPress={handleOpenEdit}
        />
      ) : (
        /* ── List mode ─────────────────────────────────────────────────── */
        <>
          {/*
           * Дашборд метрик: 4 карточки (Всего / В работе / На сегодня / Выполнено).
           * Числа пересчитываются при смене проекта или обновлении данных.
           * Тап активирует фильтр → задачи ниже фильтруются; повторный тап снимает.
           */}
          <MetricsBlock
            metrics={metrics}
            activeFilter={metricFilter}
            onFilter={(f) => setMetricFilter(
              // Повторный тап на не-total карточке → снять фильтр (вернуть к 'total')
              // Повторный тап на 'total' или любой другой тап → установить
              f === metricFilter && f !== 'total' ? 'total' : f,
            )}
          />

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
            {displayedProjects.map(p => (
              <ProjectChip
                key={p.id}
                label={p.name}
                color={p.color}
                selected={selectedProjectId === p.id}
                onPress={() => setSelectedProjectId(p.id)}
              />
            ))}
          </ScrollView>

          {/* Индикатор активного фильтра (не показывается для «Всего дел») */}
          {metricFilter !== 'total' && (
            <View style={styles.filterBar}>
              <Ionicons name="funnel-outline" size={12} color={TEXT2} />
              <Text style={styles.filterBarText}>
                {METRIC_CONFIG.find(c => c.key === metricFilter)?.label ?? 'Фильтр'}
                {' '}· {filteredScopedTasks.length} задач
              </Text>
              <TouchableOpacity
                onPress={() => setMetricFilter('total')}
                hitSlop={8}
                style={styles.filterBarClose}
              >
                <Ionicons name="close-circle" size={15} color={MUTED} />
              </TouchableOpacity>
            </View>
          )}

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={[styles.contentInner, { paddingBottom: tabBarHeight + 80 }]}
            showsVerticalScrollIndicator={false}
          >
            {/*
             * Плоский вид (отфильтрованный):
             *   • метрика ≠ «Всего дел»          → фильтруем задачи
             *   • «Все задачи» + «Всего дел»      → все задачи одним плоским списком
             *     (виртуальный проект без секций — «БЕЗ РАЗДЕЛА» не нужен)
             *
             * Структурный вид (с разделами):
             *   • «Входящие»            → inbox_tasks
             *   • конкретный проект     → его секции и project inbox
             */}
            {metricFilter !== 'total' || selectedProjectId === 'all_tasks' ? (
              filteredScopedTasks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color={MUTED} />
                  <Text style={styles.emptyTitle}>Нет задач</Text>
                  <Text style={styles.emptySubtitle}>
                    {selectedProjectId === 'all_tasks'
                      ? 'Добавь первую задачу через «+»'
                      : 'По этому фильтру задач не найдено'}
                  </Text>
                </View>
              ) : (
                renderTaskList(filteredScopedTasks)
              )
            ) : selectedProjectId === 'inbox' ? (
              data.inbox_tasks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="checkbox-outline" size={56} color={MUTED} />
                  <Text style={styles.emptyTitle}>Нет задач</Text>
                  <Text style={styles.emptySubtitle}>Нажми «+», чтобы добавить задачу во входящие</Text>
                </View>
              ) : (
                renderTaskList(data.inbox_tasks)
              )
            ) : currentProject ? (
              <>
                {currentProject.inbox_tasks.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="list-outline" size={14} color={MUTED} style={{ marginRight: 6 }} />
                      <Text style={styles.sectionName}>БЕЗ РАЗДЕЛА</Text>
                    </View>
                    {renderTaskList(currentProject.inbox_tasks)}
                  </View>
                )}

                {currentProject.sections.length === 0 && currentProject.inbox_tasks.length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="folder-open-outline" size={56} color={MUTED} />
                    <Text style={styles.emptyTitle}>Проект пуст</Text>
                    <Text style={styles.emptySubtitle}>Добавь первую задачу через «+»</Text>
                  </View>
                )}

                {currentProject.sections.map(section => (
                  <View key={section.id} style={styles.sectionBlock}>
                    {/* Кликабельный заголовок → открывает SectionManageModal */}
                    <TouchableOpacity
                      style={styles.sectionHeader}
                      onPress={() => handleOpenSectionManager(section, currentProject!)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.sectionDot, { backgroundColor: currentProject.color }]} />
                      <Text style={styles.sectionName}>{section.name.toUpperCase()}</Text>
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={14}
                        color={MUTED}
                        style={{ marginLeft: 'auto' }}
                      />
                    </TouchableOpacity>
                    {renderTaskList(section.tasks, 'В этом разделе нет активных задач')}
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Проект не найден</Text>
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* ── FAB ──────────────────────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
        style={[styles.fab, { bottom: tabBarHeight + 16 }]}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ── Create / Edit Task Modal ──────────────────────────────────────── */}
      <CreateTaskModal
        visible={modalVisible}
        projects={data.projects}
        defaultProjectId={defaultModalProjectId}
        editingTask={editingTask}
        onClose={() => { setModalVisible(false); setEditingTask(null); }}
        onSubmit={editingTask ? handleEditTask : handleCreateTask}
      />

      {/* ── Section Manage Modal ──────────────────────────────────────────── */}
      {managingSection && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setManagingSection(null)}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setManagingSection(null)}
          />
          <View style={styles.smSheet}>
            {/* Handle */}
            <View style={styles.smHandle} />
            <Text style={styles.smTitle}>Управление разделом</Text>

            {/* ── Rename field ─────────────────────────────────────── */}
            <Text style={styles.smLabel}>Название раздела</Text>
            <TextInput
              style={styles.smInput}
              value={sectionNewName}
              onChangeText={setSectionNewName}
              placeholder="Название..."
              placeholderTextColor={MUTED}
              autoFocus
            />

            {/* ── Merge target ─────────────────────────────────────── */}
            {managingSection.project.sections.filter(s => s.id !== managingSection.section.id).length > 0 && (
              <>
                <Text style={styles.smLabel}>Переместить все задачи в раздел</Text>
                {managingSection.project.sections
                  .filter(s => s.id !== managingSection.section.id)
                  .map(s => {
                    const isTarget = mergeTargetId === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.smMergeRow, isTarget && styles.smMergeRowActive]}
                        onPress={() => setMergeTargetId(isTarget ? null : s.id)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.sectionDot, { backgroundColor: managingSection.project.color, marginRight: 0 }]} />
                        <Text style={[styles.smMergeText, isTarget && { color: '#0A84FF' }]}>
                          {s.name}
                        </Text>
                        {isTarget && (
                          <Ionicons name="checkmark-circle" size={18} color="#0A84FF" style={{ marginLeft: 'auto' }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                {mergeTargetId && (
                  <Text style={styles.smMergeHint}>
                    Задачи из «{managingSection.section.name}» переедут в выбранный раздел.
                    Исходный раздел будет удалён.
                  </Text>
                )}
              </>
            )}

            {/* ── Actions ──────────────────────────────────────────── */}
            <TouchableOpacity
              style={styles.smSubmitBtn}
              onPress={handleSectionSave}
              activeOpacity={0.85}
            >
              <Text style={styles.smSubmitText}>
                {mergeTargetId ? 'Переместить и сохранить' : 'Сохранить название'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.smCancelBtn}
              onPress={() => setManagingSection(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.smCancelText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 20,
    // paddingTop: 10 — зазор между SafeArea-краем и контентом.
    // Двухрядная структура гарантирует, что StatusIndicator (position: absolute,
    // top: insets.top + 12, ~28px высота) не перекрывает кнопки переключателя.
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },

  // Строка 1: заголовок — занимает полную ширину (badge справа не блокирует)
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    // minHeight чуть больше высоты StatusIndicator badge (~28px) + зазор
    minHeight: 38,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28, fontWeight: '700', color: TEXT, letterSpacing: 0.2,
    lineHeight: 34,
  },

  // Строка 2: переключатель — ниже badge (badge bottom ≈ insets.top + 40)
  headerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 3,
    gap: 2,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 9,
  },
  modeBtnActive: { backgroundColor: '#0A84FF' },
  modeBtnLabel: { fontSize: 12, fontWeight: '600', color: TEXT2 },
  modeBtnLabelActive: { color: '#fff' },

  // ── Filter bar (активный фильтр метрики) ──────────────────────────────────
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: CARD2,
    borderRadius: 8,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  filterBarText: { fontSize: 12, color: TEXT2, flex: 1, fontWeight: '500' },
  filterBarClose: { padding: 2 },

  // ── Section Manage Modal ──────────────────────────────────────────────────
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  smSheet: {
    backgroundColor: CARD,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingHorizontal:    20,
    paddingBottom:        40,
    paddingTop:           12,
  },
  smHandle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: MUTED,
    alignSelf:       'center',
    marginBottom:    16,
  },
  smTitle: {
    fontSize:    17,
    fontWeight:  '600',
    color:       TEXT,
    marginBottom: 20,
    textAlign:   'center',
  },
  smLabel: {
    fontSize:     12,
    color:        TEXT2,
    marginBottom:  6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  smInput: {
    backgroundColor: BG,
    borderRadius:    10,
    paddingHorizontal: 12,
    paddingVertical:   10,
    fontSize:          15,
    color:             TEXT,
    marginBottom:      20,
  },
  smMergeRow: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    paddingVertical:  10,
    paddingHorizontal: 12,
    borderRadius:      10,
    marginBottom:      4,
  },
  smMergeRowActive: {
    backgroundColor: 'rgba(10,132,255,0.1)',
  },
  smMergeText: {
    fontSize: 15,
    color:    TEXT,
  },
  smMergeHint: {
    fontSize:     12,
    color:        TEXT2,
    marginTop:     4,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  smSubmitBtn: {
    backgroundColor: '#0A84FF',
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       8,
    marginBottom:    8,
  },
  smSubmitText: {
    color:      '#fff',
    fontWeight: '600',
    fontSize:   16,
  },
  smCancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  smCancelText: {
    color:    TEXT2,
    fontSize: 15,
  },

  // ── Project chips ─────────────────────────────────────────────────────────
  chipsScroll: { flexGrow: 0, marginTop: 10 },
  chipsContainer: { paddingHorizontal: 16, paddingBottom: 4, gap: 8, flexDirection: 'row' },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: CARD,
    borderWidth: 1, borderColor: BORDER,
  },
  chipSelected: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  chipDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  chipLabel: { fontSize: 13, fontWeight: '500', color: TEXT2 },
  chipLabelSelected: { color: '#fff' },

  // ── Content ───────────────────────────────────────────────────────────────
  content: { flex: 1, marginTop: 10 },
  contentInner: { paddingHorizontal: 16 },

  // ── Section block ─────────────────────────────────────────────────────────
  sectionBlock: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  sectionName: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 1.2 },

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
  taskCheckbox: { marginTop: 2, marginRight: 12 },
  checkboxCircle: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '500', color: TEXT, lineHeight: 20 },
  taskDescription: { fontSize: 12, color: TEXT2, marginTop: 3 },
  taskMeta: { gap: 3, marginTop: 5 },
  taskDateRow: { flexDirection: 'row', alignItems: 'center' },
  taskDue: { fontSize: 11, color: TEXT2 },
  taskRight: { alignItems: 'flex-end', gap: 6, marginLeft: 8 },
  priorityBadge: { fontSize: 10, fontWeight: '700' },
  taskDeleteBtn: { padding: 2 },

  // ── Empty states ──────────────────────────────────────────────────────────
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: TEXT2, marginTop: 16 },
  emptySubtitle: {
    fontSize: 14, color: MUTED, marginTop: 8,
    textAlign: 'center', paddingHorizontal: 30, lineHeight: 20,
  },
  emptyHint: { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 16 },

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute', right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#0A84FF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0A84FF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
});
