import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Product names are `@user_pin` and `@biometrics_enabled`.
 * SecureStore rejects `@` — keys may only contain [A-Za-z0-9._-].
 * Values are strings: the PIN itself, and `'true'` for the biometric flag.
 */
export const USER_PIN_KEY = 'user_pin';
export const BIOMETRICS_ENABLED_KEY = 'biometrics_enabled';

const PIN_PATTERN = /^\d{4}$/;
const BIOMETRICS_ON = 'true';

let secureStoreAvailablePromise: Promise<boolean> | null = null;

function secureStoreAvailable(): Promise<boolean> {
  if (!secureStoreAvailablePromise) {
    secureStoreAvailablePromise = (async () => {
      if (Platform.OS === 'web') return false;
      try {
        return await SecureStore.isAvailableAsync();
      } catch (error) {
        console.warn('SecureStore is unavailable, falling back to AsyncStorage', error);
        return false;
      }
    })();
  }
  return secureStoreAvailablePromise;
}

async function readValue(key: string): Promise<string | null> {
  try {
    if (await secureStoreAvailable()) {
      return await SecureStore.getItemAsync(key);
    }
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to read app-lock value "${key}"`, error);
    throw new Error('Не удалось прочитать настройки защиты');
  }
}

async function writeValue(key: string, value: string): Promise<void> {
  try {
    if (await secureStoreAvailable()) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Failed to write app-lock value "${key}"`, error);
    throw new Error('Не удалось сохранить настройки защиты');
  }
}

async function removeValue(key: string): Promise<void> {
  try {
    const existing = await readValue(key);
    if (existing == null) return;
    if (await secureStoreAvailable()) {
      await SecureStore.deleteItemAsync(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  } catch (error) {
    if (error instanceof Error && error.message === 'Не удалось прочитать настройки защиты') {
      throw error;
    }
    console.warn(`Failed to remove app-lock value "${key}"`, error);
    throw new Error('Не удалось обновить настройки защиты');
  }
}

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function describeAppLock(pin: string | null, biometricsEnabled: boolean): string {
  if (!pin) return 'PIN-код и биометрия';
  if (biometricsEnabled) return 'PIN-код и биометрия включены';
  return 'PIN-код включён';
}

export async function getUserPin(): Promise<string | null> {
  const value = await readValue(USER_PIN_KEY);
  if (value == null) return null;
  if (isValidPin(value)) return value;

  console.warn('Stored PIN is invalid and will be cleared');
  try {
    await removeValue(USER_PIN_KEY);
    await removeValue(BIOMETRICS_ENABLED_KEY);
  } catch (error) {
    console.warn('Failed to clear an invalid PIN', error);
  }
  return null;
}

export async function setUserPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) {
    throw new Error('PIN-код должен состоять из 4 цифр');
  }
  await writeValue(USER_PIN_KEY, pin);
}

export async function clearUserPin(): Promise<void> {
  await removeValue(USER_PIN_KEY);
  await removeValue(BIOMETRICS_ENABLED_KEY);
}

export async function getBiometricsEnabled(): Promise<boolean> {
  const pin = await getUserPin();
  if (!pin) return false;
  const value = await readValue(BIOMETRICS_ENABLED_KEY);
  return value === BIOMETRICS_ON;
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  if (!enabled) {
    await removeValue(BIOMETRICS_ENABLED_KEY);
    return;
  }
  const pin = await getUserPin();
  if (!pin) {
    throw new Error('Сначала задайте PIN-код');
  }
  await writeValue(BIOMETRICS_ENABLED_KEY, BIOMETRICS_ON);
}
