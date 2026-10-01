import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinIndicators, PinKeypad, usePinBuffer } from '../components/security/PinPad';
import {
  authenticateWithBiometrics,
  cancelBiometricPrompt,
} from '../security/biometricAuth';
import { getBiometricsEnabled, getUserPin } from '../storage/appLockStorage';

interface PinLockScreenProps {
  onUnlock: () => void;
}

export default function PinLockScreen({ onUnlock }: PinLockScreenProps) {
  const insets = useSafeAreaInsets();
  const buffer = usePinBuffer();
  const [ready, setReady] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;
  const unlocked = useRef(false);
  const mounted = useRef(true);
  const bioInFlight = useRef(false);

  const finish = () => {
    if (unlocked.current) return;
    unlocked.current = true;
    onUnlockRef.current();
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void cancelBiometricPrompt();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pin, bio] = await Promise.all([getUserPin(), getBiometricsEnabled()]);
        if (cancelled) return;
        if (!pin) {
          finish();
          return;
        }
        setBiometricsEnabled(bio);
        setReady(true);
      } catch (readError) {
        console.warn('Failed to load app lock', readError);
        if (!cancelled) {
          setError('Не удалось прочитать код. Введите PIN ещё раз.');
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // finish is stable for this mount: it only touches refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runBiometric = async () => {
    if (bioInFlight.current || unlocked.current) return;
    bioInFlight.current = true;
    setBioBusy(true);
    setError(null);
    try {
      const result = await authenticateWithBiometrics('Подтвердите вход в BYTE');
      if (!mounted.current || unlocked.current) return;
      if (result.success) {
        finish();
        return;
      }
      if (result.message) setError(result.message);
    } finally {
      bioInFlight.current = false;
      if (mounted.current) setBioBusy(false);
    }
  };

  useEffect(() => {
    if (!ready || !biometricsEnabled) return;
    let active = true;
    const timer = setTimeout(() => {
      if (active) void runBiometric();
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // Prompt once when the lock screen becomes ready with biometrics on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, biometricsEnabled]);

  const submit = async (code: string) => {
    buffer.setBlocked(true);
    setError(null);
    try {
      const stored = await getUserPin();
      if (!mounted.current) return;
      if (!stored || stored === code) {
        finish();
        return;
      }
      setError('Неверный PIN-код');
      buffer.shakeAndClear();
    } catch (checkError) {
      console.warn('PIN check failed', checkError);
      if (mounted.current) {
        setError('Не удалось проверить PIN-код');
        buffer.clear();
      }
    } finally {
      buffer.setBlocked(false);
    }
  };

  const onDigit = (digit: string) => {
    const next = buffer.push(digit);
    if (!next) return;
    if (next.length === 1) setError(null);
    if (next.length === 4) void submit(next);
  };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 20) },
      ]}
    >
      <View style={styles.hero}>
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={26} color="#007AFF" />
        </View>
        <Text style={styles.brand}>BYTE</Text>
        <Text style={styles.title}>Введите PIN-код</Text>
        <PinIndicators length={buffer.value.length} failed={buffer.failed} shakeKey={buffer.shakeKey} />
        <Text style={[styles.message, error ? styles.messageError : null]}>
          {error ?? (bioBusy ? 'Ожидание биометрии…' : ' ')}
        </Text>
        {!ready && <ActivityIndicator color="#007AFF" style={styles.loader} />}
      </View>

      <PinKeypad
        onDigit={onDigit}
        onDelete={buffer.pop}
        deleteDisabled={buffer.value.length === 0}
        disabled={!ready}
        showBiometric={biometricsEnabled}
        biometricBusy={bioBusy}
        onBiometric={() => {
          void runBiometric();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0E0E10',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  brand: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 28,
  },
  message: {
    marginTop: 18,
    minHeight: 22,
    fontSize: 14,
    textAlign: 'center',
    color: '#8E8E93',
  },
  messageError: {
    color: '#FF453A',
  },
  loader: {
    marginTop: 8,
  },
});
