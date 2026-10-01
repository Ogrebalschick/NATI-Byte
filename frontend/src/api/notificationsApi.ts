import { apiFetch } from './http';

export type NotificationCategory = 'tasks' | 'reminders' | 'wishes';

export interface AppNotification {
  id: number | string;
  user_id: number;
  title: string;
  body: string;
  category: NotificationCategory;
  is_read: boolean;
  created_at: string;
}

export interface NotificationCreatePayload {
  title: string;
  body?: string;
  category?: NotificationCategory;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const err = await response.json().catch(() => ({}));
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object' && 'msg' in detail[0]) {
    return String((detail[0] as { msg?: unknown }).msg || fallback);
  }
  return fallback;
}

function normalizeCategory(raw: unknown): NotificationCategory {
  if (raw === 'reminders' || raw === 'wishes' || raw === 'tasks') return raw;
  return 'tasks';
}

export function normalizeNotification(raw: unknown): AppNotification | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = row.id;
  if (id === undefined || id === null) return null;
  return {
    id: typeof id === 'number' || typeof id === 'string' ? id : String(id),
    user_id: Number(row.user_id) || 0,
    title: String(row.title || ''),
    body: String(row.body || ''),
    category: normalizeCategory(row.category),
    is_read: Boolean(row.is_read),
    created_at: row.created_at ? String(row.created_at) : new Date().toISOString(),
  };
}

export async function fetchNotifications(token: string): Promise<AppNotification[]> {
  const res = await apiFetch('/notifications', {}, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось загрузить уведомления'));
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeNotification)
    .filter((item): item is AppNotification => item !== null);
}

export async function fetchUnreadCount(token: string): Promise<number> {
  const res = await apiFetch('/notifications/unread-count', {}, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось получить счётчик уведомлений'));
  const data = await res.json();
  const count = Number((data as { count?: unknown })?.count);
  return Number.isFinite(count) ? count : 0;
}

export async function apiMarkNotificationRead(
  token: string,
  id: number,
  isRead = true,
): Promise<AppNotification> {
  const res = await apiFetch(`/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_read: isRead }),
  }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось отметить уведомление'));
  const parsed = normalizeNotification(await res.json());
  if (!parsed) throw new Error('Некорректный ответ сервера');
  return parsed;
}

export async function apiMarkAllNotificationsRead(token: string): Promise<number> {
  const res = await apiFetch('/notifications/read-all', { method: 'POST' }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось отметить все уведомления'));
  const data = await res.json().catch(() => ({}));
  const marked = Number((data as { marked?: unknown })?.marked);
  return Number.isFinite(marked) ? marked : 0;
}

export async function apiCreateNotification(
  token: string,
  payload: NotificationCreatePayload,
): Promise<AppNotification> {
  const res = await apiFetch('/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      category: payload.category ?? 'tasks',
    }),
  }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось создать уведомление'));
  const parsed = normalizeNotification(await res.json());
  if (!parsed) throw new Error('Некорректный ответ сервера');
  return parsed;
}
