/**
 * Guest biorhythm reminders. Authenticated users receive morning/evening
 * pushes from the backend scheduler; guests store clocks in AsyncStorage
 * and, outside Expo Go, get a daily local notification at those times.
 *
 * expo-notifications is required lazily: a static import crashes Expo Go on Android.
 */
import { Platform } from 'react-native';
import { isExpoGo } from './expoGo';

const CHANNEL_ID = 'byte-rhythm';
const WAKE_ID = 'byte-rhythm-wake';
const SLEEP_ID = 'byte-rhythm-sleep';

type NotificationsModule = typeof import('expo-notifications');

function isNative(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function loadNotifications(): NotificationsModule | null {
  if (isExpoGo || !isNative()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

function parseClock(hhmm: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

async function ensureChannel(Notifications: NotificationsModule): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Режим дня',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 80, 180],
        lightColor: '#FFD60A',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

export async function cancelGuestRhythmNotifications(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(WAKE_ID).catch(() => undefined),
    Notifications.cancelScheduledNotificationAsync(SLEEP_ID).catch(() => undefined),
  ]);
}

/**
 * Replace the guest's local morning and evening notifications with the clocks
 * stored in `@guest_wake_time` / `@guest_sleep_time`.
 */
export async function syncGuestRhythmNotifications(wake: string, sleep: string): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;

  const wakeClock = parseClock(wake);
  const sleepClock = parseClock(sleep);
  if (!wakeClock || !sleepClock) return;

  const granted = await ensureChannel(Notifications);
  if (!granted) return;

  await cancelGuestRhythmNotifications();

  const channel = Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {};

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: WAKE_ID,
      content: {
        title: 'Доброе утро',
        body: 'Байтик подготовил утреннее пожелание и прогноз погоды',
        sound: true,
        data: { url: '/profile/notifications', slot: 'morning' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: wakeClock.hour,
        minute: wakeClock.minute,
        ...channel,
      },
    });
    await Notifications.scheduleNotificationAsync({
      identifier: SLEEP_ID,
      content: {
        title: 'Пора отдыхать',
        body: 'Байтик оставляет вечернюю поддержку и не тревожит сон',
        sound: true,
        data: { url: '/profile/notifications', slot: 'evening' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: sleepClock.hour,
        minute: sleepClock.minute,
        ...channel,
      },
    });
  } catch (error) {
    console.warn('[DayRhythm] Failed to schedule guest pushes:', error);
  }
}
