/**
 * Local OS reminders 30 minutes before a task due/schedule time.
 * Uses expo-notifications DATE trigger (SDK 57).
 *
 * Expo Go (SDK 53+) throws on import of expo-notifications on Android.
 * All native calls are skipped there; they run only in a development/production build.
 */
import { Platform } from 'react-native';
import { isExpoGo } from './expoGo';
import { removeReminderId, saveReminderId } from '../storage/notificationsStorage';

const CHANNEL_ID = 'byte-reminders';
const LEAD_MS = 30 * 60 * 1000;

type NotificationsModule = typeof import('expo-notifications');

export interface ReminderTask {
  id: string;
  title: string;
  due_date?: string | null;
  schedule_date?: string | null;
}

function isNative(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** Lazy-load so Expo Go never evaluates the native module. */
function loadNotifications(): NotificationsModule | null {
  if (isExpoGo || !isNative()) return null;
  // Native require — not a static import. Safe to skip in StoreClient.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Earlier of schedule_date / due_date that has a valid datetime. */
export function pickTaskTargetTime(task: ReminderTask): Date | null {
  const dates = [parseDate(task.schedule_date), parseDate(task.due_date)]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

export function reminderFireAt(task: ReminderTask): Date | null {
  const target = pickTaskTargetTime(task);
  if (!target) return null;
  return new Date(target.getTime() - LEAD_MS);
}

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Напоминания BYTE',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 80, 180],
    lightColor: '#0A84FF',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (isExpoGo) return false;
  const Notifications = loadNotifications();
  if (!Notifications) return false;
  try {
    await ensureAndroidChannel(Notifications);
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    return status === 'granted';
  } catch {
    return false;
  }
}

function reminderIdentifier(taskId: string): string {
  return `byte-task-${taskId}`;
}

export async function cancelTaskReminder(taskId: string): Promise<void> {
  if (isExpoGo) return;
  const Notifications = loadNotifications();
  if (!Notifications) return;
  const identifier = reminderIdentifier(taskId);
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // identifier may not exist yet
  }
  const stored = await removeReminderId(taskId);
  if (stored && stored !== identifier) {
    try {
      await Notifications.cancelScheduledNotificationAsync(stored);
    } catch { /* already gone */ }
  }
}

/**
 * Cancel any previous reminder for this task, then schedule a new one
 * 30 minutes before the target datetime — only if that moment is still in the future.
 * Returns true when a notification was actually scheduled.
 */
export async function scheduleTaskReminder(task: ReminderTask): Promise<boolean> {
  if (isExpoGo) return false;

  await cancelTaskReminder(task.id);

  const fireAt = reminderFireAt(task);
  if (!fireAt || fireAt.getTime() <= Date.now() + 5_000) return false;

  const Notifications = loadNotifications();
  if (!Notifications) return false;

  const granted = await ensureNotificationPermissions();
  if (!granted) return false;

  const target = pickTaskTargetTime(task);
  const timeLabel = target
    ? target.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '';

  try {
    const identifier = reminderIdentifier(task.id);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: task.title.trim() || 'Напоминание',
        body: timeLabel
          ? `Через 30 минут — ${timeLabel}`
          : 'Через 30 минут истекает срок задачи',
        sound: true,
        data: { taskId: task.id, url: '/(tabs)/todos' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
    await saveReminderId(task.id, identifier);
    return true;
  } catch (e) {
    console.warn('[Reminders] Failed to schedule:', e);
    return false;
  }
}
