import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_TODOS_KEY = '@byte_todos_guest';

// ── Shared types (used by both guest storage and the screen) ──────────────────

export interface TodoTask {
  id: string; // server numeric ID as string, or 'g_<timestamp>_<rand>' for guest
  project_id: string | null;
  section_id: string | null;
  title: string;
  description: string;
  due_date: string | null;
  schedule_date: string | null;
  duration_minutes: number | null; // длительность в минутах (для сетки календаря)
  priority: 1 | 2 | 3 | 4;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface TodoSection {
  id: string;
  project_id: string;
  name: string;
  position: number;
  tasks: TodoTask[];
}

export interface TodoProject {
  id: string;
  name: string;
  color: string;
  created_at: string;
  sections: TodoSection[];
  inbox_tasks: TodoTask[]; // tasks in this project but no section
}

export interface TodosData {
  projects: TodoProject[];
  inbox_tasks: TodoTask[]; // tasks with no project
}

// ── Empty state factory ───────────────────────────────────────────────────────

export function emptyTodosData(): TodosData {
  return { projects: [], inbox_tasks: [] };
}

// ── Guest ID generator ────────────────────────────────────────────────────────

export function guestId(): string {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── AsyncStorage helpers ──────────────────────────────────────────────────────

export async function loadGuestTodos(): Promise<TodosData> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_TODOS_KEY);
    if (!raw) return emptyTodosData();
    return JSON.parse(raw) as TodosData;
  } catch {
    return emptyTodosData();
  }
}

export async function saveGuestTodos(data: TodosData): Promise<void> {
  await AsyncStorage.setItem(GUEST_TODOS_KEY, JSON.stringify(data));
}

export async function clearGuestTodos(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_TODOS_KEY);
}

// ── Immutable data-tree helpers ───────────────────────────────────────────────

/** Remove a task from wherever it lives in the tree. */
export function removeTaskFromTree(data: TodosData, taskId: string): TodosData {
  return {
    inbox_tasks: data.inbox_tasks.filter(t => t.id !== taskId),
    projects: data.projects.map(p => ({
      ...p,
      inbox_tasks: p.inbox_tasks.filter(t => t.id !== taskId),
      sections: p.sections.map(s => ({
        ...s,
        tasks: s.tasks.filter(t => t.id !== taskId),
      })),
    })),
  };
}

/** Replace a task in-place across the whole tree. */
export function updateTaskInTree(data: TodosData, updated: TodoTask): TodosData {
  const upd = (tasks: TodoTask[]) =>
    tasks.map(t => (t.id === updated.id ? updated : t));
  return {
    inbox_tasks: upd(data.inbox_tasks),
    projects: data.projects.map(p => ({
      ...p,
      inbox_tasks: upd(p.inbox_tasks),
      sections: p.sections.map(s => ({ ...s, tasks: upd(s.tasks) })),
    })),
  };
}

/** Insert a task into the correct slot in the tree. */
export function addTaskToTree(data: TodosData, task: TodoTask): TodosData {
  if (!task.project_id) {
    return { ...data, inbox_tasks: [...data.inbox_tasks, task] };
  }
  return {
    ...data,
    projects: data.projects.map(p => {
      if (p.id !== task.project_id) return p;
      if (!task.section_id) {
        return { ...p, inbox_tasks: [...p.inbox_tasks, task] };
      }
      return {
        ...p,
        sections: p.sections.map(s => {
          if (s.id !== task.section_id) return s;
          return { ...s, tasks: [...s.tasks, task] };
        }),
      };
    }),
  };
}
