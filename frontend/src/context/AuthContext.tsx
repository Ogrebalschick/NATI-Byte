import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { getApiUrl, hydrateApiUrl } from '../api/config';
import { apiFetch, isSessionExpired, setAuthSessionActive, setSessionExpiredHandler } from '../api/http';
import { currentDeviceName } from '../deviceName';
import {
  NstuImportModal,
  type CabinetPageType,
} from '../components/NstuImportModal';
import { clearDepartedUserChatCache } from '../storage/chatStorage';
import { cancelGuestRhythmNotifications } from '../notifications/dayRhythm';

export { getApiUrl };

// ── Types ──────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error_auth' | 'success';

const LAST_SYNC_KEY = '@last_sync_date';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PROFILE_REVIEW_KEY = '@last_profile_review_date';
const PROFILE_REVIEW_MS = 180 * 24 * 60 * 60 * 1000;

export type StudentDataSnapshot = {
  payload: Record<string, unknown>;
  updated_at: string | null;
};

export type StudentDataMap = Record<string, StudentDataSnapshot>;

interface User {
  id: number;
  email: string;
  name: string;
  is_2fa_enabled?: boolean;
  full_name?: string | null;
  student_group?: string | null;
  is_synced_with_nstu?: boolean;
  has_password?: boolean;
  wake_time?: string | null;
  sleep_time?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  syncStatus: SyncStatus;

  // Standard login — throws {type:'requires_verification'} error when 2FA is on
  login: (email: string, password: string) => Promise<void>;
  // Complete 2FA login with code from email
  verifyLogin: (email: string, code: string) => Promise<void>;

  // Registration step 1: request verification code
  requestRegisterCode: (email: string, password: string, name: string) => Promise<void>;
  // Registration step 2: verify code → creates account + auto-login
  verifyRegister: (email: string, code: string) => Promise<void>;

  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  toggle2FA: (enabled: boolean) => Promise<void>;
  updateDayRhythm: (wakeTime: string, sleepTime: string) => Promise<void>;
  requestPasswordReset: () => Promise<void>;
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>;
  parseCabinet: (pageType: CabinetPageType, rawText: string) => Promise<any>;
  nstuLogin: (email: string) => Promise<void>;
  setPassword: (newPassword: string) => Promise<void>;
  markLastSync: () => Promise<void>;
  getStudentData: (types?: string[]) => Promise<StudentDataMap>;
  dismissSyncStatus: () => void;
  /** True when the signed-in user has not confirmed profile facts for 180 days. */
  showReviewBanner: boolean;
  confirmProfileReview: () => Promise<void>;
}
// ── Context setup ──────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function authBody(payload: Record<string, string>): string {
  const deviceName = currentDeviceName();
  return JSON.stringify(deviceName ? { ...payload, device_name: deviceName } : payload);
}

// ── Provider ───────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [autoSyncVisible, setAutoSyncVisible] = useState(false);
  const [showReviewBanner, setShowReviewBanner] = useState(false);
  const reviewCheckId = React.useRef(0);
  const tokenRef = React.useRef<string | null>(null);
  const dailySyncChecked = React.useRef(false);
  const logoutRef = React.useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    setSessionExpiredHandler(async () => {
      await logoutRef.current();
      router.replace('/profile/auth?notice=session_ended');
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      await hydrateApiUrl();
      const storedToken = await AsyncStorage.getItem('@auth_token');
      const storedUser = await AsyncStorage.getItem('@auth_user');
      if (storedToken && storedUser) {
        tokenRef.current = storedToken;
        setAuthSessionActive(true);
        setToken(storedToken);
        try {
          const meRes = await apiFetch('/auth/me', {}, storedToken);
          const cached = JSON.parse(storedUser);
          if (meRes.ok) {
            const me = await meRes.json();
            const merged = { ...cached, ...me };
            setUser(merged);
            await AsyncStorage.setItem('@auth_user', JSON.stringify(merged));
          } else {
            setUser(cached);
          }
        } catch (error) {
          if (!isSessionExpired(error)) {
            setUser(JSON.parse(storedUser));
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load auth data', error);
    } finally {
      setIsLoading(false);
    }
  };

  /** Persist token + user to memory and AsyncStorage. */
  const persistAuth = async (accessToken: string, userData: User) => {
    tokenRef.current = accessToken;
    setAuthSessionActive(true);
    setUser(userData);
    setToken(accessToken);
    await AsyncStorage.setItem('@auth_token', accessToken);
    await AsyncStorage.setItem('@auth_user', JSON.stringify(userData));
  };

  // ── Login ────────────────────────────────────────────────────────────────────

  const login = async (email: string, password: string) => {
    const response = await fetch(`${getApiUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: authBody({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Ошибка входа');
    }

    const data = await response.json();

    if (data.status === 'requires_verification') {
      // Signal to the screen that it must show the 2FA code input
      const err = new Error('requires_verification') as any;
      err.type = 'requires_verification';
      throw err;
    }

    await persistAuth(data.access_token, data.user);
  };

  const verifyLogin = async (email: string, code: string) => {
    const response = await fetch(`${getApiUrl()}/auth/login/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: authBody({ email, code }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Неверный код');
    }

    const data = await response.json();
    await persistAuth(data.access_token, data.user);
  };

  // ── Registration ─────────────────────────────────────────────────────────────

  const requestRegisterCode = async (email: string, password: string, name: string) => {
    const response = await fetch(`${getApiUrl()}/auth/register/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Не удалось отправить код');
    }
    // Returns { status: 'code_sent' } — screen handles next step
  };

  const verifyRegister = async (email: string, code: string) => {
    const response = await fetch(`${getApiUrl()}/auth/register/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: authBody({ email, code }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Неверный код');
    }

    const data = await response.json();
    await persistAuth(data.access_token, data.user);
  };

  // ── Logout / Delete ───────────────────────────────────────────────────────────

  const logout = async () => {
    const departedUserId = user?.id ?? null;
    setAuthSessionActive(false);
    tokenRef.current = null;
    dailySyncChecked.current = false;
    setAutoSyncVisible(false);
    setSyncStatus('idle');
    setUser(null);
    setToken(null);
    setShowReviewBanner(false);
    await AsyncStorage.multiRemove(['@auth_token', '@auth_user']);
    await clearDepartedUserChatCache(departedUserId);
  };
  logoutRef.current = logout;

  const deleteAccount = async () => {
    if (!token) return;
    try {
      await apiFetch('/auth/delete', { method: 'DELETE' }, token);
    } catch (error) {
      if (isSessionExpired(error)) return;
    }
    await logout();
  };

  // ── Settings ───────────────────────────────────────────────────────────────────

  const toggle2FA = async (enabled: boolean) => {
    if (!token) return;
    const response = await apiFetch('/auth/2fa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }, token);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Ошибка при изменении 2FA');
    }

    // Sync local user state so the switch reflects the new value
    if (user) {
      const updated = { ...user, is_2fa_enabled: enabled };
      setUser(updated);
      await AsyncStorage.setItem('@auth_user', JSON.stringify(updated));
    }
  };

  const updateDayRhythm = async (wakeTime: string, sleepTime: string) => {
    if (!token) throw new Error('Вы не авторизованы');
    const response = await apiFetch('/auth/profile/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wake_time: wakeTime, sleep_time: sleepTime }),
    }, token);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const detail = err?.detail;
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail) && detail[0]?.msg
          ? String(detail[0].msg)
          : 'Не удалось сохранить режим дня';
      throw new Error(message);
    }
    const data = await response.json();
    setUser(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        wake_time: typeof data.wake_time === 'string' ? data.wake_time : wakeTime,
        sleep_time: typeof data.sleep_time === 'string' ? data.sleep_time : sleepTime,
      };
      AsyncStorage.setItem('@auth_user', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    await cancelGuestRhythmNotifications();
  };

  const requestPasswordReset = async () => {
    if (!token) throw new Error('Вы не авторизованы');
    const response = await apiFetch('/auth/password-reset/request', { method: 'POST' }, token);
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Не удалось отправить код');
    }
  };

  const confirmPasswordReset = async (code: string, newPassword: string) => {
    if (!token) throw new Error('Вы не авторизованы');
    const response = await apiFetch('/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, new_password: newPassword }),
    }, token);
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Не удалось изменить пароль');
    }
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, has_password: true };
      AsyncStorage.setItem('@auth_user', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  const nstuLogin = async (email: string) => {
    const response = await fetch(`${getApiUrl()}/auth/nstu-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: authBody({ email }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Не удалось войти через NSTU ID');
    }
    const data = await response.json();
    await persistAuth(data.access_token, {
      ...data.user,
      has_password: data.has_password ?? data.user?.has_password ?? false,
    });
  };

  const setPassword = async (newPassword: string) => {
    const authToken = tokenRef.current;
    if (!authToken) throw new Error('Вы не авторизованы');
    const response = await apiFetch('/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    }, authToken);
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Не удалось установить пароль');
    }
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, has_password: true };
      AsyncStorage.setItem('@auth_user', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  const parseCabinet = async (pageType: CabinetPageType, rawText: string) => {
    const authToken = tokenRef.current;
    if (!authToken) throw new Error('Вы не авторизованы');
    const response = await apiFetch('/sync/parse-cabinet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_type: pageType, raw_text: rawText }),
    }, authToken);
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Не удалось разобрать страницу личного кабинета');
    }
    const data = await response.json();
    setUser(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        full_name: data.full_name ?? prev.full_name,
        student_group: data.student_group ?? prev.student_group,
        is_synced_with_nstu: data.is_synced_with_nstu ?? true,
      };
      AsyncStorage.setItem('@auth_user', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    return data;
  };

  const markLastSync = async () => {
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  };

  const dismissSyncStatus = () => {
    setSyncStatus('idle');
  };

  const getStudentData = React.useCallback(async (types?: string[]): Promise<StudentDataMap> => {
    const authToken = tokenRef.current;
    if (!authToken) throw new Error('Вы не авторизованы');
    const query = types?.length ? `?types=${encodeURIComponent(types.join(','))}` : '';
    const response = await apiFetch(`/sync/student-data${query}`, {}, authToken);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Не удалось загрузить данные статистики');
    }
    const data = await response.json();
    return (data.items || {}) as StudentDataMap;
  }, []);

  const startAutoSync = () => {
    if (autoSyncVisible) return;
    setSyncStatus('syncing');
    setAutoSyncVisible(true);
  };

  const maybeStartDailySync = async (currentUser: User) => {
    if (dailySyncChecked.current) return;
    dailySyncChecked.current = true;
    try {
      const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const lastTs = raw ? Number(raw) : 0;
      const overdue = lastTs > 0 && Date.now() - lastTs >= SYNC_INTERVAL_MS;
      const neverSyncedButCabinetLinked =
        !lastTs && !!currentUser.is_synced_with_nstu;
      if (overdue || neverSyncedButCabinetLinked) {
        startAutoSync();
      }
    } catch {
      // Keep idle if storage is unavailable
    }
  };

  const confirmProfileReview = async () => {
    const raw = await AsyncStorage.getItem(PROFILE_REVIEW_KEY);
    let store: Record<string, string> = {};
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          store = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          );
        }
      } catch {
        store = {};
      }
    }
    if (!user) return;
    store[String(user.id)] = new Date().toISOString();
    await AsyncStorage.setItem(PROFILE_REVIEW_KEY, JSON.stringify(store));
    reviewCheckId.current += 1;
    setShowReviewBanner(false);
  };

  useEffect(() => {
    if (isLoading || !user) return;
    maybeStartDailySync(user);
  }, [isLoading, user]);

  useEffect(() => {
    if (isLoading || !user) {
      if (!isLoading) setShowReviewBanner(false);
      return;
    }
    const userId = user.id;
    const checkId = ++reviewCheckId.current;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PROFILE_REVIEW_KEY);
        let stamp: string | null = null;
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const value = (parsed as Record<string, unknown>)[String(userId)];
              if (typeof value === 'string') stamp = value;
            }
          } catch {
            stamp = null;
          }
          if (!stamp && !Number.isNaN(Date.parse(raw))) stamp = raw;
        }
        const reviewedAt = stamp ? Date.parse(stamp) : NaN;
        const due = !stamp || Number.isNaN(reviewedAt) || Date.now() - reviewedAt >= PROFILE_REVIEW_MS;
        if (!cancelled && reviewCheckId.current === checkId) setShowReviewBanner(due);
      } catch {
        if (!cancelled && reviewCheckId.current === checkId) setShowReviewBanner(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, user]);

  const handleAutoSyncFinished = async () => {
    await markLastSync();
    setAutoSyncVisible(false);
    setSyncStatus('success');
  };

  const handleAutoSyncAuthError = () => {
    setAutoSyncVisible(false);
    setSyncStatus('error_auth');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        syncStatus,
        login,
        verifyLogin,
        requestRegisterCode,
        verifyRegister,
        logout,
        deleteAccount,
        toggle2FA,
        updateDayRhythm,
        requestPasswordReset,
        confirmPasswordReset,
        parseCabinet,
        nstuLogin,
        setPassword,
        markLastSync,
        getStudentData,
        dismissSyncStatus,
        showReviewBanner,
        confirmProfileReview,
      }}
    >
      {children}
      <NstuImportModal
        visible={autoSyncVisible}
        mode="auto-sync"
        onClose={handleAutoSyncAuthError}
        onScraped={parseCabinet}
        onFinished={handleAutoSyncFinished}
        onAuthError={handleAutoSyncAuthError}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
