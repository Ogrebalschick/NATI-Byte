import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const CUSTOM_API_IP_KEY = '@custom_api_ip';
export const API_PORT = 8000;
export const DEFAULT_API_HOST = '192.168.50.100';

const HOST_PATTERN =
  /^(localhost|(\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;

/**
 * Expo web preview renders on Node, where `window` does not exist.
 * Native apps also have no `window`, so this flag alone is not "skip storage":
 * iOS and Android still read AsyncStorage through the native module.
 */
const isServer = typeof window === 'undefined';

function platformOs(): string | null {
  try {
    if (typeof Platform === 'undefined' || Platform == null) return null;
    return typeof Platform.OS === 'string' ? Platform.OS : null;
  } catch {
    return null;
  }
}

/** Android phones and emulators use the computer's LAN address. Everywhere else, localhost. */
export function defaultApiUrl(): string {
  const host = platformOs() === 'android' ? DEFAULT_API_HOST : 'localhost';
  return `http://${host}:${API_PORT}`;
}

let currentApiUrl = defaultApiUrl();
let revision = 0;
let hydratePromise: Promise<void> | null = null;

/** Base URL for every backend request. Read this at call time so a new IP applies immediately. */
export function getApiUrl(): string {
  return currentApiUrl;
}

export function normalizeApiHost(input: string): string {
  let host = input.trim();
  host = host.replace(/^https?:\/\//i, '');
  host = host.split('/')[0] ?? '';
  host = host.replace(/:\d+$/, '');
  return host.trim();
}

function isValidHost(host: string): boolean {
  if (!host || host.length > 253 || !HOST_PATTERN.test(host)) return false;
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return true;
  return host.split('.').every(part => {
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

/**
 * Point the in-memory base URL at `http://${newIp}:8000`.
 * Does not write AsyncStorage — the caller persists the host when the user saves.
 */
export function updateApiUrl(newIp: string): void {
  const host = normalizeApiHost(newIp);
  if (!isValidHost(host)) {
    throw new Error('Введите корректный IP, например 192.168.1.45');
  }
  revision += 1;
  currentApiUrl = `http://${host}:${API_PORT}`;
}

/** Drop the saved host and restore the platform default (192.168.50.100 on Android). */
export async function resetApiUrl(): Promise<void> {
  revision += 1;
  await AsyncStorage.removeItem(CUSTOM_API_IP_KEY);
  currentApiUrl = defaultApiUrl();
}

function canReadStoredHost(): boolean {
  if (!isServer) return true;
  const os = platformOs();
  return os === 'ios' || os === 'android';
}

/** Load `@custom_api_ip` once. A later save or reset is not overwritten by an in-flight read. */
export function hydrateApiUrl(): Promise<void> {
  if (!canReadStoredHost()) {
    return Promise.resolve();
  }
  if (!hydratePromise) {
    const ticket = revision;
    hydratePromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(CUSTOM_API_IP_KEY);
        if (ticket !== revision) return;
        if (!stored?.trim()) return;
        const host = normalizeApiHost(stored);
        if (!isValidHost(host)) return;
        currentApiUrl = `http://${host}:${API_PORT}`;
      } catch (error) {
        console.error('Failed to load custom API IP', error);
      }
    })();
  }
  return hydratePromise;
}

void hydrateApiUrl();
