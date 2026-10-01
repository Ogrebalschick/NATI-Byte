import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, type SyncStatus } from '../context/AuthContext';

const SUCCESS_MS = 2200;
const ERROR_MS = 5000;
const BAR_HEIGHT = 40;

function bannerCopy(status: SyncStatus): { text: string; tone: 'sync' | 'ok' | 'err' } | null {
  if (status === 'syncing') return { text: 'Синхронизация данных с ЛК НГТУ...', tone: 'sync' };
  if (status === 'success') return { text: 'Данные обновлены!', tone: 'ok' };
  if (status === 'error_auth') {
    return { text: 'Сессия устарела. Войдите заново в ЛК через Профиль', tone: 'err' };
  }
  return null;
}

export const SyncStatusBanner = () => {
  const { syncStatus, dismissSyncStatus, cancelSync } = useAuth();
  const [shown, setShown] = useState<SyncStatus | null>(null);
  const height = useRef(new Animated.Value(0)).current;
  const barX = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    loopRef.current?.stop();

    if (syncStatus === 'idle') {
      Animated.timing(height, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setShown(null);
      });
      return;
    }

    setShown(syncStatus);
    Animated.timing(height, {
      toValue: BAR_HEIGHT,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

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

    const delay = syncStatus === 'success' ? SUCCESS_MS : ERROR_MS;
    hideTimer.current = setTimeout(() => {
      dismissSyncStatus();
    }, delay);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [syncStatus, dismissSyncStatus, height, barX]);

  const visibleStatus = syncStatus !== 'idle' ? syncStatus : shown;
  const copy = visibleStatus ? bannerCopy(visibleStatus) : null;
  const toneStyle =
    copy?.tone === 'ok' ? styles.ok : copy?.tone === 'err' ? styles.err : styles.sync;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { height, pointerEvents: copy ? 'auto' : 'none' },
      ]}
    >
      {copy ? (
        <View style={[styles.row, toneStyle]}>
          {copy.tone === 'sync' ? <ActivityIndicator size="small" color="#64D2FF" /> : null}
          <Text style={[styles.text, copy.tone === 'err' && styles.errText]} numberOfLines={1}>
            {copy.text}
          </Text>
          {copy.tone === 'sync' ? (
            <TouchableOpacity
              onPress={cancelSync}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Отменить синхронизацию"
              style={styles.close}
            >
              <Ionicons name="close" size={18} color="#F2F2F7" />
            </TouchableOpacity>
          ) : null}
          {copy.tone === 'sync' ? (
            <View style={[styles.statusTrack, { pointerEvents: 'none' }]}>
              <Animated.View
                style={[
                  styles.statusFill,
                  {
                    transform: [
                      {
                        translateX: barX.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-90, 320],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    width: '100%',
  },
  row: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  sync: { backgroundColor: 'rgba(10,132,255,0.22)' },
  ok: { backgroundColor: 'rgba(48,209,88,0.22)' },
  err: { backgroundColor: 'rgba(255,69,58,0.24)' },
  text: {
    flex: 1,
    color: '#F2F2F7',
    fontSize: 13,
    fontWeight: '600',
  },
  errText: { color: '#FF8A84' },
  close: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(100,210,255,0.18)',
    overflow: 'hidden',
  },
  statusFill: {
    width: 90,
    height: 2,
    backgroundColor: '#64D2FF',
  },
});
