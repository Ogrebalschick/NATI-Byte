import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_WAKE_KEY = '@guest_wake_time';
export const GUEST_SLEEP_KEY = '@guest_sleep_time';

export const DEFAULT_WAKE = '08:00';
export const DEFAULT_SLEEP = '22:30';

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isClock(value: string | null | undefined): value is string {
  return typeof value === 'string' && CLOCK.test(value);
}

export function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function clockToDate(hhmm: string, fallback: string): Date {
  const source = isClock(hhmm) ? hhmm : fallback;
  const match = CLOCK.exec(source);
  const date = new Date();
  date.setHours(Number(match?.[1] ?? 8), Number(match?.[2] ?? 0), 0, 0);
  return date;
}

export async function loadGuestDayRhythm(): Promise<{ wake: string; sleep: string }> {
  const [wake, sleep] = await Promise.all([
    AsyncStorage.getItem(GUEST_WAKE_KEY),
    AsyncStorage.getItem(GUEST_SLEEP_KEY),
  ]);
  return {
    wake: isClock(wake) ? wake : DEFAULT_WAKE,
    sleep: isClock(sleep) ? sleep : DEFAULT_SLEEP,
  };
}

export async function saveGuestDayRhythm(wake: string, sleep: string): Promise<void> {
  await AsyncStorage.multiSet([
    [GUEST_WAKE_KEY, wake],
    [GUEST_SLEEP_KEY, sleep],
  ]);
}
