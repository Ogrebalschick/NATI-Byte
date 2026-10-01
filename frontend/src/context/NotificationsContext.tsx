import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  apiCreateNotification,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  fetchNotifications,
  fetchUnreadCount,
  type AppNotification,
  type NotificationCategory,
} from '../api/notificationsApi';
import { isSessionExpired } from '../api/http';
import { useAuth } from './AuthContext';
import {
  addGuestNotification,
  loadGuestNotifications,
  markAllGuestNotificationsRead,
  markGuestNotificationRead,
} from '../storage/notificationsStorage';
import { cancelTaskReminder, scheduleTaskReminder, type ReminderTask } from '../notifications/localReminders';

interface NotificationsContextType {
  items: AppNotification[];
  unreadCount: number;
  latest: AppNotification[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: number | string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Put a freshly created card at the top of the feed without a full reload. */
  prependNotification: (item: AppNotification) => void;
  /** Schedule OS push. Optionally write a feed card (API or AsyncStorage). */
  rememberTask: (task: ReminderTask, opts?: { writeFeed?: boolean }) => Promise<void>;
  forgetTask: (taskId: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

function unreadOf(items: AppNotification[]): number {
  return items.filter(item => !item.is_read).length;
}

function byNewest(items: AppNotification[]): AppNotification[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    const tok = tokenRef.current;
    try {
      if (tok) {
        const [list, count] = await Promise.all([
          fetchNotifications(tok),
          fetchUnreadCount(tok),
        ]);
        const sorted = byNewest(list);
        setItems(sorted);
        setUnreadCount(count);
      } else {
        const list = byNewest(await loadGuestNotifications());
        setItems(list);
        setUnreadCount(unreadOf(list));
      }
    } catch (e) {
      if (!isSessionExpired(e)) console.warn('[Notifications] refresh failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [token, isAuthenticated, refresh]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', onChange);
    const timer = setInterval(() => { void refresh(); }, 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  const markRead = useCallback(async (id: number | string) => {
    const tok = tokenRef.current;
    const numeric = typeof id === 'number' ? id : Number(id);
    const isGuestId = String(id).startsWith('g_');
    try {
      if (tok && Number.isFinite(numeric) && !isGuestId) {
        const updated = await apiMarkNotificationRead(tok, numeric, true);
        setItems(prev => byNewest(prev.map(item =>
          String(item.id) === String(id) ? updated : item,
        )));
        setUnreadCount(c => Math.max(0, c - 1));
      } else {
        const next = byNewest(await markGuestNotificationRead(id, true));
        setItems(next);
        setUnreadCount(unreadOf(next));
      }
    } catch (e) {
      if (!isSessionExpired(e)) console.warn('[Notifications] markRead failed:', e);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const tok = tokenRef.current;
    try {
      if (tok) {
        await apiMarkAllNotificationsRead(tok);
        setItems(prev => prev.map(item => ({ ...item, is_read: true })));
        setUnreadCount(0);
      } else {
        const next = await markAllGuestNotificationsRead();
        setItems(byNewest(next));
        setUnreadCount(0);
      }
    } catch (e) {
      if (!isSessionExpired(e)) console.warn('[Notifications] markAllRead failed:', e);
    }
  }, []);

  const rememberTask = useCallback(async (task: ReminderTask, opts?: { writeFeed?: boolean }) => {
    const scheduled = await scheduleTaskReminder(task);
    if (!scheduled || opts?.writeFeed === false) return;

    const title = task.title.trim() || 'Задача';
    const body = 'Напоминание за 30 минут до срока';
    const category: NotificationCategory = 'tasks';
    const tok = tokenRef.current;

    try {
      if (tok) {
        const created = await apiCreateNotification(tok, { title, body, category });
        setItems(prev => byNewest([created, ...prev.filter(i => i.id !== created.id)]));
        setUnreadCount(c => c + (created.is_read ? 0 : 1));
      } else {
        const created = await addGuestNotification({ title, body, category });
        setItems(prev => byNewest([created, ...prev]));
        setUnreadCount(c => c + 1);
      }
    } catch (e) {
      if (!isSessionExpired(e)) console.warn('[Notifications] rememberTask feed failed:', e);
    }
  }, []);

  const prependNotification = useCallback((created: AppNotification) => {
    setItems(prev => byNewest([
      created,
      ...prev.filter(item => String(item.id) !== String(created.id)),
    ]));
    if (!created.is_read) setUnreadCount(count => count + 1);
  }, []);

  const forgetTask = useCallback(async (taskId: string) => {
    await cancelTaskReminder(taskId);
  }, []);

  const latest = useMemo(() => items.slice(0, 3), [items]);

  const value = useMemo<NotificationsContextType>(() => ({
    items,
    unreadCount,
    latest,
    isLoading,
    refresh,
    markRead,
    markAllRead,
    prependNotification,
    rememberTask,
    forgetTask,
  }), [
    items,
    unreadCount,
    latest,
    isLoading,
    refresh,
    markRead,
    markAllRead,
    prependNotification,
    rememberTask,
    forgetTask,
  ]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextType {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return ctx;
}
