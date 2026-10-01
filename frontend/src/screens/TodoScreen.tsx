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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
    projects: data.projects.map(fromApiProject),
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

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TodoScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const prevToken = useRef<string | null>(null);

  const [data, setData]                     = useState<TodosData>(emptyTodosData());
  const [isLoading, setIsLoading]           = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('inbox');
  const [completingIds, setCompletingIds]   = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible]     = useState(false);
  const [editingTask, setEditingTask]       = useState<TodoTask | null>(null);
  const [viewMode, setViewMode]             = useState<ViewMode>('list');

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
          for (const section of project.sections) {
            try {
              const ss = await apiCreateSection(tok, sp.id, section.name, section.position);
              for (const task of section.tasks) {
                await apiCreateTask(tok, {
                  title: task.title, description: task.description,
                  project_id: sp.id, section_id: ss.id,
                  due_date: task.due_date, schedule_date: task.schedule_date,
                  duration_minutes: task.duration_minutes,
                  priority: task.priority,
                }).catch(() => {});
              }
            } catch {}
          }
          for (const task of project.inbox_tasks) {
            await apiCreateTask(tok, {
              title: task.title, description: task.description, project_id: sp.id,
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
        const updated = await apiUpdateTask(token, taskId, {
          title:            payload.title,
          description:      payload.description,
          due_date:         payload.due_date,
          schedule_date:    payload.schedule_date,
          duration_minutes: payload.duration_minutes,
          priority:         payload.priority,
        });
        setData(prev => updateTaskInTree(prev, fromApiTask(updated)));
      } catch (e) {
        if (!isSessionExpired(e)) Alert.alert('Ошибка', 'Не удалось сохранить задачу');
      }
    } else {
      // Guest edit: update in local state
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
  }, [editingTask, token]);

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

  // ── Derived data ───────────────────────────────────────────────────────────

  const currentProject = useMemo(
    () => selectedProjectId !== 'inbox'
      ? data.projects.find(p => p.id === selectedProjectId) ?? null
      : null,
    [selectedProjectId, data.projects],
  );

  const allTasks = useMemo(() => flattenAllTasks(data), [data]);

  const defaultModalProjectId = selectedProjectId !== 'inbox' ? selectedProjectId : null;

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
            contentContainerStyle={[styles.contentInner, { paddingBottom: tabBarHeight + 80 }]}
            showsVerticalScrollIndicator={false}
          >
            {selectedProjectId === 'inbox' ? (
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
                    <View style={styles.sectionHeader}>
                      <View style={[styles.sectionDot, { backgroundColor: currentProject.color }]} />
                      <Text style={styles.sectionName}>{section.name.toUpperCase()}</Text>
                    </View>
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
