/**
 * StatusIndicator — глобальный бейдж состояния приложения.
 *
 * Позиционируется в правом верхнем углу поверх всех экранов (zIndex 9999).
 * Показывается в двух состояниях:
 *   • Офлайн  → оранжевый бейдж «Офлайн режим» (приоритетнее гостевого).
 *   • Гостевой → серый бейдж «Гостевой режим» (online, но не авторизован).
 *
 * Если пользователь online и авторизован — компонент ничего не рендерит.
 * Используется в RootLayout (app/_layout.tsx) единожды.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export function StatusIndicator({ embedded = false }: { embedded?: boolean }) {
  const { isAuthenticated } = useAuth();
  const { isConnected } = useNetInfo();
  const insets = useSafeAreaInsets();

  // isConnected is null while NetInfo is initializing — treat null as online
  const isOffline = isConnected === false;

  // Nothing to show when online + authorized
  if (!isOffline && isAuthenticated) return null;

  const offline = isOffline;

  return (
    <View
      style={[
        styles.badge,
        { pointerEvents: 'none' },
        embedded
          ? styles.badgeEmbedded
          : { top: insets.top + 12, right: 16, position: 'absolute', zIndex: 9999 },
        offline ? styles.badgeOffline : styles.badgeGuest,
      ]}
    >
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'person-circle-outline'}
        size={13}
        color={offline ? '#FF9F0A' : '#8E8E93'}
        style={styles.icon}
      />
      <Text style={[styles.label, offline ? styles.labelOffline : styles.labelGuest]}>
        {offline ? 'Офлайн режим' : 'Гостевой режим'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    // Тонкая рамка вместо тяжёлой тени — соответствует стилю BYTE
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeEmbedded: {
    position: 'relative',
  },

  // ── Офлайн (оранжевый акцент) ─────────────────────────────────────────────
  badgeOffline: {
    backgroundColor: 'rgba(255, 159, 10, 0.14)',
    borderColor: 'rgba(255, 159, 10, 0.35)',
  },

  // ── Гостевой (нейтральный серый) ──────────────────────────────────────────
  badgeGuest: {
    backgroundColor: 'rgba(44, 44, 46, 0.92)',
    borderColor: '#3A3A3C',
  },

  icon: {
    marginRight: 5,
  },

  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  labelOffline: {
    color: '#FF9F0A',
  },

  labelGuest: {
    color: '#8E8E93',
  },
});
