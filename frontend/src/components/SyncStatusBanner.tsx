import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, type SyncStatus } from '../context/AuthContext';

const SUCCESS_MS = 2200;
const ERROR_MS = 5000;

function bannerCopy(status: SyncStatus): { text: string; tone: 'sync' | 'ok' | 'err' } | null {
  if (status === 'syncing') return { text: 'Синхронизация данных с ЛК НГТУ...', tone: 'sync' };
  if (status === 'success') return { text: 'Данные обновлены!', tone: 'ok' };
  if (status === 'error_auth') {
    return { text: 'Сессия устарела. Войдите заново в ЛК через Профиль', tone: 'err' };
  }
  return null;
}

export const SyncStatusBanner = () => {
  const insets = useSafeAreaInsets();
  const { syncStatus, dismissSyncStatus } = useAuth();
  const [shown, setShown] = useState<SyncStatus | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const barX = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const appear = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const hide = (after: () => void) => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 360, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -10, duration: 360, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) after();
    });
  };

  useEffect(() => {
    if (syncStatus === 'idle') {
      loopRef.current?.stop();
      setShown(null);
      return;
    }

    setShown(syncStatus);
    opacity.setValue(0);
    translateY.setValue(-12);
    appear();

    if (hideTimer.current) clearTimeout(hideTimer.current);

    if (syncStatus === 'syncing') {
      barX.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(barX, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      );
      loopRef.current.start();
      return;
    }

    loopRef.current?.stop();
    const delay = syncStatus === 'success' ? SUCCESS_MS : ERROR_MS;
    hideTimer.current = setTimeout(() => {
      hide(() => {
        setShown(null);
        dismissSyncStatus();
      });
    }, delay);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [syncStatus]);

  const copy = shown ? bannerCopy(shown) : null;
  if (!copy) return null;

  const toneStyle =
    copy.tone === 'ok' ? styles.ok : copy.tone === 'err' ? styles.err : styles.sync;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { paddingTop: insets.top + 4, opacity, transform: [{ translateY }] },
      ]}
    >
      {copy.tone === 'sync' && (
        <View style={styles.statusTrack}>
          <Animated.View
            style={[
              styles.statusFill,
              {
                transform: [
                  {
                    translateX: barX.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-80, 280],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      )}
      <View style={[styles.card, toneStyle]}>
        {copy.tone === 'sync' && <ActivityIndicator size="small" color="#64D2FF" />}
        <Text style={[styles.text, copy.tone === 'err' && styles.errText]}>{copy.text}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 12,
  },
  statusTrack: {
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(100,210,255,0.18)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  statusFill: {
    width: 80,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#64D2FF',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sync: { backgroundColor: 'rgba(10,132,255,0.18)' },
  ok: { backgroundColor: 'rgba(48,209,88,0.18)' },
  err: { backgroundColor: 'rgba(255,69,58,0.2)' },
  text: {
    flex: 1,
    color: '#F2F2F7',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  errText: { color: '#FF8A84' },
});
