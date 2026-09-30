import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  NstuImportModal,
  type CabinetPageType,
} from '../components/NstuImportModal';
import { clearDepartedUserChatCache } from '../storage/chatStorage';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error_auth' | 'success';

const LAST_SYNC_KEY = '@last_sync_date';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
  requestPasswordReset: () => Promise<void>;
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>;
  parseCabinet: (pageType: CabinetPageType, rawText: string) => Promise<any>;
  nstuLogin: (email: string) => Promise<void>;
  setPassword: (newPassword: string) => Promise<void>;
  markLastSync: () => Promise<void>;
  getStudentData: (types?: string[]) => Promise<StudentDataMap>;
  dismissSyncStatus: () => void;
}
// ── Context setup ──────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const API_URL =
  Platform.OS === 'android'
    ? 'http://192.168.50.100:8000'
    : 'http://localhost:8000';

// ── Provider ───────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [autoSyncVisible, setAutoSyncVisible] = useState(false);
  const tokenRef = React.useRef<string | null>(null);
  const dailySyncChecked = React.useRef(false);

  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('@auth_token');
      const storedUser = await AsyncStorage.getItem('@auth_user');
      if (storedToken && storedUser) {
        tokenRef.current = storedToken;
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        try {
          const meRes = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            const merged = { ...JSON.parse(storedUser), ...me };
            setUser(merged);
            await AsyncStorage.setItem('@auth_user', JSON.stringify(merged));
          }
        } catch {
          // Keep cached user if /me is unreachable
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
    setUser(userData);
    setToken(accessToken);
    await AsyncStorage.setItem('@auth_token', accessToken);
    await AsyncStorage.setItem('@auth_user', JSON.stringify(userData));
  };

  // ── Login ────────────────────────────────────────────────────────────────────

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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
    const response = await fetch(`${API_URL}/auth/login/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
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
    const response = await fetch(`${API_URL}/auth/register/init`, {
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
    const response = await fetch(`${API_URL}/auth/register/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
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
    tokenRef.current = null;
    dailySyncChecked.current = false;
    setAutoSyncVisible(false);
    setSyncStatus('idle');
    setUser(null);
    setToken(null);
    await AsyncStorage.multiRemove(['@auth_token', '@auth_user']);
    await clearDepartedUserChatCache(departedUserId);
  };

  const deleteAccount = async () => {
    if (!token) return;
    await fetch(`${API_URL}/auth/delete`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await logout();
  };

  // ── Settings ───────────────────────────────────────────────────────────────────

  const toggle2FA = async (enabled: boolean) => {
    if (!token) return;
    const response = await fetch(`${API_URL}/auth/2fa`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled }),
    });

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

  const requestPasswordReset = async () => {
    if (!token) throw new Error('Вы не авторизованы');
    const response = await fetch(`${API_URL}/auth/password-reset/request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Не удалось отправить код');
    }
  };

  const confirmPasswordReset = async (code: string, newPassword: string) => {
    if (!token) throw new Error('Вы не авторизованы');
    const response = await fetch(`${API_URL}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code, new_password: newPassword }),
    });
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
    const response = await fetch(`${API_URL}/auth/nstu-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
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
    const response = await fetch(`${API_URL}/auth/set-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ new_password: newPassword }),
    });
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
    const response = await fetch(`${API_URL}/sync/parse-cabinet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ page_type: pageType, raw_text: rawText }),
    });
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
    const response = await fetch(`${API_URL}/sync/student-data${query}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
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

  useEffect(() => {
    if (isLoading || !user) return;
    maybeStartDailySync(user);
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
        requestPasswordReset,
        confirmPasswordReset,
        parseCabinet,
        nstuLogin,
        setPassword,
        markLastSync,
        getStudentData,
        dismissSyncStatus,
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
