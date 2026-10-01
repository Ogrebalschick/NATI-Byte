import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppNotification, NotificationCategory } from '../api/notificationsApi';

const GUEST_FEED_KEY = '@byte_notifications_guest';
const REMINDER_IDS_KEY = '@byte_task_reminder_ids';

function guestNotifId(): string {
  return `g_n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function loadGuestNotifications(): Promise<AppNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_FEED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AppNotification[];
  } catch {
    return [];
  }
}

export async function saveGuestNotifications(items: AppNotification[]): Promise<void> {
  await AsyncStorage.setItem(GUEST_FEED_KEY, JSON.stringify(items));
}

export async function addGuestNotification(input: {
  title: string;
  body?: string;
  category?: NotificationCategory;
}): Promise<AppNotification> {
  const item: AppNotification = {
    id: guestNotifId(),
    user_id: 0,
    title: input.title,
    body: input.body ?? '',
    category: input.category ?? 'tasks',
    is_read: false,
    created_at: new Date().toISOString(),
  };
  const prev = await loadGuestNotifications();
  const next = [item, ...prev];
  await saveGuestNotifications(next);
  return item;
}

export async function markGuestNotificationRead(
  id: number | string,
  isRead = true,
): Promise<AppNotification[]> {
  const prev = await loadGuestNotifications();
  const next = prev.map(item =>
    String(item.id) === String(id) ? { ...item, is_read: isRead } : item,
  );
  await saveGuestNotifications(next);
  return next;
}

export async function markAllGuestNotificationsRead(): Promise<AppNotification[]> {
  const prev = await loadGuestNotifications();
  const next = prev.map(item => ({ ...item, is_read: true }));
  await saveGuestNotifications(next);
  return next;
}

export async function loadReminderIds(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_IDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

export async function saveReminderId(taskId: string, notificationId: string): Promise<void> {
  const map = await loadReminderIds();
  map[taskId] = notificationId;
  await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(map));
}

export async function removeReminderId(taskId: string): Promise<string | undefined> {
  const map = await loadReminderIds();
  const existing = map[taskId];
  if (!existing) return undefined;
  delete map[taskId];
  await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(map));
  return existing;
}
