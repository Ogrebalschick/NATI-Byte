import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchSessions,
  revokeOtherSessions,
  revokeSession,
  type DeviceSession,
} from '../api/sessionsApi';
import { isSessionExpired } from '../api/http';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';

function deviceIcon(name: string): keyof typeof Ionicons.glyphMap {
  const label = name.toLowerCase();
  if (label.includes('ipad') || label.includes('pad') || label.includes('tablet')) {
    return 'tablet-portrait-outline';
  }
  if (
    label.includes('windows')
    || label.includes('mac')
    || label.includes('linux')
    || label.includes('браузер')
  ) {
    return 'laptop-outline';
  }
  return 'phone-portrait-outline';
}

function formatLastActive(value: string): string {
  if (!value) return 'Активность неизвестна';
  const trimmed = value.trim().replace(' ', 'T');
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const date = new Date(hasZone ? trimmed : `${trimmed}Z`);
  if (Number.isNaN(date.getTime())) return 'Активность неизвестна';

  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `Сегодня в ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Вчера в ${time}`;
  const day = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(date).replace('.', '');
  return `${day} в ${time}`;
}

function activityTime(value: string): number {
  if (!value) return 0;
  const trimmed = value.trim().replace(' ', 'T');
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const time = Date.parse(hasZone ? trimmed : `${trimmed}Z`);
  return Number.isNaN(time) ? 0 : time;
}

function byLastActive(rows: DeviceSession[]): DeviceSession[] {
  return [...rows].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    return activityTime(b.last_active) - activityTime(a.last_active);
  });
}

const SessionsScreen = () => {
  const { isAuthenticated, isLoading, token } = useAuth();

  return (
    <ScreenWrapper bg="#17161B" style={styles.screen}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#007AFF" />
        </View>
      ) : isAuthenticated && token ? (
        <SessionsList token={token} />
      ) : (
        <GuestSessions />
      )}
    </ScreenWrapper>
  );
};

const GuestSessions = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.guest, { paddingTop: insets.top + 12 }]}>
      <BackButton />
      <View style={styles.guestBody}>
        <View style={styles.emptyIcon}>
          <Ionicons name="phone-portrait-outline" size={36} color="#007AFF" />
        </View>
        <Text style={styles.emptyTitle}>Только для аккаунта</Text>
        <Text style={styles.emptyText}>
          Список устройств доступен после входа. Войдите, чтобы посмотреть, где открыт аккаунт, и завершить лишние сессии.
        </Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => router.push('/profile/auth')}>
          <Text style={styles.signInText}>Войти в аккаунт</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const BackButton = () => {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.backRow}
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Назад"
    >
      <Ionicons name="chevron-back" size={22} color="#0A84FF" />
      <Text style={styles.backText}>Профиль</Text>
    </TouchableOpacity>
  );
};

const SessionsList = ({ token }: { token: string }) => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions(byLastActive(await fetchSessions(token)));
    } catch (err) {
      if (isSessionExpired(err)) return;
      setError(err instanceof Error ? err.message : 'Не удалось загрузить сессии');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const others = sessions.filter(item => !item.is_current);

  const revokeOthers = async () => {
    setRevokingOthers(true);
    try {
      await revokeOtherSessions(token);
      setSessions(current => current.filter(item => item.is_current));
      setConfirmOthers(false);
    } catch (err) {
      if (!isSessionExpired(err)) {
        setError(err instanceof Error ? err.message : 'Не удалось завершить другие сессии');
      }
    } finally {
      setRevokingOthers(false);
    }
  };

  const removeOne = async (session: DeviceSession) => {
    if (session.is_current || removingId) return;
    setRemovingId(session.id);
    try {
      await revokeSession(token, session.id);
      setSessions(current => current.filter(item => item.id !== session.id));
    } catch (err) {
      if (!isSessionExpired(err)) {
        setError(err instanceof Error ? err.message : 'Не удалось завершить сессию');
      }
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Animated.ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: Math.max(tabBarHeight, 88) + 28 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
      <BackButton />
      <Text style={styles.title}>Активные сессии</Text>
      <Text style={styles.subtitle}>
        Устройства, на которых выполнен вход в BYTE. Завершённая сессия сразу теряет доступ.
      </Text>

      {confirmOthers ? (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>
            Остальные устройства выйдут из аккаунта. Это устройство останется.
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={styles.confirmCancel}
              onPress={() => setConfirmOthers(false)}
              disabled={revokingOthers}
              accessibilityRole="button"
            >
              <Text style={styles.confirmCancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmLeave}
              onPress={() => { void revokeOthers(); }}
              disabled={revokingOthers}
              accessibilityRole="button"
              accessibilityLabel="Подтвердить выход на других устройствах"
            >
              {revokingOthers ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmLeaveText}>Выйти</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.revokeButton, (others.length === 0 || revokingOthers) && styles.revokeButtonDisabled]}
          onPress={() => { if (others.length > 0) setConfirmOthers(true); }}
          disabled={others.length === 0 || revokingOthers || loading}
          accessibilityRole="button"
          accessibilityLabel="Выйти на других устройствах"
        >
          <Text style={styles.revokeText}>Выйти на других устройствах</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.centeredBlock}>
          <ActivityIndicator color="#007AFF" />
        </View>
      ) : error ? (
        <View style={styles.centeredBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); void load(); }}>
            <Text style={styles.retryText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.centeredBlock}>
          <Text style={styles.emptyText}>Активных сессий нет. Войдите снова.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              busy={removingId === session.id}
              onRemove={() => { void removeOne(session); }}
            />
          ))}
        </View>
      )}
      </View>
    </Animated.ScrollView>
  );
};

const SessionCard = ({
  session,
  busy,
  onRemove,
}: {
  session: DeviceSession;
  busy: boolean;
  onRemove: () => void;
}) => (
  <Animated.View
    layout={LinearTransition.duration(280)}
    exiting={FadeOut.duration(220)}
    style={styles.card}
  >
    <View style={styles.iconWrap}>
      <Ionicons name={deviceIcon(session.device_name)} size={22} color="#0A84FF" />
    </View>
    <View style={styles.cardBody}>
      <View style={styles.nameRow}>
        <Text style={styles.deviceName} numberOfLines={2}>{session.device_name}</Text>
        {session.is_current ? <Text style={styles.youMark}>(Вы)</Text> : null}
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {session.ip_address ? `IP ${session.ip_address}` : 'IP не определён'}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>{formatLastActive(session.last_active)}</Text>
    </View>
    {session.is_current ? null : (
      <TouchableOpacity
        style={styles.trash}
        onPress={onRemove}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Завершить сессию ${session.device_name}`}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#FF453A" />
        ) : (
          <Ionicons name="trash-outline" size={20} color="#FF453A" />
        )}
      </TouchableOpacity>
    )}
  </Animated.View>
);

export default SessionsScreen;

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  flex: { flex: 1 },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 640,
    paddingHorizontal: 16,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centeredBlock: { paddingTop: 36, alignItems: 'center' },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  backText: { color: '#0A84FF', fontSize: 17, marginLeft: 2 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 12 },
  subtitle: {
    color: '#8e8e93',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 18,
  },
  revokeButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  revokeButtonDisabled: { opacity: 0.45 },
  revokeText: { color: '#FF453A', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  confirmBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    gap: 14,
  },
  confirmText: { color: '#F2F2F7', fontSize: 15, lineHeight: 21 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  confirmCancel: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  confirmCancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  confirmLeave: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF453A',
  },
  confirmLeaveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10, 132, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  deviceName: { color: '#F2F2F7', fontSize: 16, fontWeight: '600', flexShrink: 1 },
  youMark: { color: '#30D158', fontSize: 15, fontWeight: '700' },
  meta: { color: '#8e8e93', fontSize: 13, lineHeight: 18, marginTop: 2 },
  trash: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
  },
  errorText: { color: '#FF8A84', fontSize: 15, textAlign: 'center', marginBottom: 14 },
  retryButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  retryText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },
  guest: { flex: 1, paddingHorizontal: 16 },
  guestBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 48 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: '#8e8e93', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  signInButton: {
    marginTop: 22,
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
