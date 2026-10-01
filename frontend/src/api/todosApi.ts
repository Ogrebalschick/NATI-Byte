import { apiFetch } from './http';

// ── Server response shapes ────────────────────────────────────────────────────

export interface ApiTask {
  id: number;
  user_id: number;
  project_id: number | null;
  section_id: number | null;
  title: string;
  description: string;
  due_date: string | null;
  priority: 1 | 2 | 3 | 4;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiSection {
  id: number;
  project_id: number;
  name: string;
  position: number;
  tasks: ApiTask[];
}

export interface ApiProject {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
  sections: ApiSection[];
  inbox_tasks: ApiTask[];
}

export interface ApiTodosData {
  projects: ApiProject[];
  inbox_tasks: ApiTask[];
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface TaskCreatePayload {
  title: string;
  description?: string;
  project_id?: number | null;
  section_id?: number | null;
  due_date?: string | null;
  priority?: number;
}

export interface TaskUpdatePayload {
  title?: string;
  description?: string;
  project_id?: number | null;
  section_id?: number | null;
  due_date?: string | null;
  priority?: number;
  is_completed?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readError(response: Response, fallback: string): Promise<string> {
  const err = await response.json().catch(() => ({}));
  const d = (err as { detail?: unknown }).detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return fallback;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function fetchTodosData(token: string): Promise<ApiTodosData> {
  const res = await apiFetch('/todos/data', {}, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось загрузить задачи'));
  return res.json();
}

export async function apiCreateProject(
  token: string,
  name: string,
  color: string,
): Promise<ApiProject> {
  const res = await apiFetch('/todos/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось создать проект'));
  return res.json();
}

export async function apiCreateSection(
  token: string,
  project_id: number,
  name: string,
  position = 0,
): Promise<ApiSection> {
  const res = await apiFetch('/todos/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id, name, position }),
  }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось создать раздел'));
  return res.json();
}

export async function apiCreateTask(
  token: string,
  payload: TaskCreatePayload,
): Promise<ApiTask> {
  const res = await apiFetch('/todos/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось создать задачу'));
  return res.json();
}

export async function apiUpdateTask(
  token: string,
  taskId: number,
  payload: TaskUpdatePayload,
): Promise<ApiTask> {
  const res = await apiFetch(`/todos/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось обновить задачу'));
  return res.json();
}

export async function apiDeleteTask(token: string, taskId: number): Promise<void> {
  const res = await apiFetch(`/todos/tasks/${taskId}`, { method: 'DELETE' }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось удалить задачу'));
}
