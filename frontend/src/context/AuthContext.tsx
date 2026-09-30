import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ── Types ──────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  email: string;
  name: string;
  is_2fa_enabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

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

  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('@auth_token');
      const storedUser = await AsyncStorage.getItem('@auth_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.warn('Failed to load auth data', error);
    } finally {
      setIsLoading(false);
    }
  };

  /** Persist token + user to memory and AsyncStorage. */
  const persistAuth = async (accessToken: string, userData: User) => {
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
    setUser(null);
    setToken(null);
    await AsyncStorage.removeItem('@auth_token');
    await AsyncStorage.removeItem('@auth_user');
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
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        verifyLogin,
        requestRegisterCode,
        verifyRegister,
        logout,
        deleteAccount,
        toggle2FA,
        requestPasswordReset,
        confirmPasswordReset,
      }}
    >
      {children}
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
