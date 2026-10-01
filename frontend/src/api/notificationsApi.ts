import { getApiUrl } from './config';
import { apiFetch } from './http';

export type NotificationCategory = 'tasks' | 'reminders' | 'wishes';
export type PushSlot = 'morning' | 'evening';

export interface AppNotification {
  id: number | string;
  user_id: number;
  title: string;
  body: string;
  category: NotificationCategory;
  image_url?: string | null;
  push_slot?: PushSlot | null;
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

function normalizePushSlot(raw: unknown): PushSlot | null {
  if (raw === 'morning' || raw === 'evening') return raw;
  return null;
}

/** Sun, umbrella, moon, or sleeping cat — only for Byte's own morning/evening cards. */
export function notificationEmoji(item: Pick<AppNotification, 'category' | 'body' | 'push_slot'>): string | null {
  const body = item.body || '';
  if (item.category === 'wishes' || item.push_slot === 'morning') {
    return /зонтик|дожд|☔|☂/i.test(body) ? '⛱️' : '☀️';
  }
  if (item.push_slot === 'evening') {
    return /книг|музык|обнима|я с тобой|тяжел/i.test(body) ? '🐱' : '🌙';
  }
  return null;
}

/** Turn `/static/memes/cat.png` into an absolute URL on the current backend. */
export function resolveNotificationImageUrl(imageUrl: string | null | undefined): string | null {
  const raw = (imageUrl || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${getApiUrl()}${path}`;
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
    image_url: typeof row.image_url === 'string' && row.image_url.trim() ? row.image_url.trim() : null,
    push_slot: normalizePushSlot(row.push_slot),
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

export async function apiTriggerMagic(token: string): Promise<AppNotification> {
  const res = await apiFetch('/notifications/trigger-magic', { method: 'POST' }, token);
  if (!res.ok) throw new Error(await readError(res, 'Не удалось сгенерировать пожелание'));
  const parsed = normalizeNotification(await res.json());
  if (!parsed) throw new Error('Некорректный ответ сервера');
  return parsed;
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
