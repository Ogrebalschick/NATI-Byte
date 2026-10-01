import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const REJECT_MS = 460;

function usePinRejection() {
  const [shakeKey, setShakeKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const rejecting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const reject = useCallback((onDone?: () => void) => {
    rejecting.current = true;
    setFailed(true);
    setShakeKey((key) => key + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      rejecting.current = false;
      setFailed(false);
      onDone?.();
    }, REJECT_MS);
  }, []);

  return { shakeKey, failed, rejecting, reject };
}

export function usePinBuffer() {
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  const blocked = useRef(false);
  const { shakeKey, failed, rejecting, reject } = usePinRejection();

  const sync = useCallback((next: string) => {
    valueRef.current = next;
    setValue(next);
  }, []);

  const push = useCallback((digit: string): string | null => {
    if (blocked.current || rejecting.current || valueRef.current.length >= 4) return null;
    if (!/^\d$/.test(digit)) return null;
    const next = `${valueRef.current}${digit}`;
    valueRef.current = next;
    setValue(next);
    return next;
  }, []);

  const pop = useCallback(() => {
    if (blocked.current || rejecting.current || valueRef.current.length === 0) return;
    const next = valueRef.current.slice(0, -1);
    valueRef.current = next;
    setValue(next);
  }, []);

  const clear = useCallback(() => {
    sync('');
  }, [sync]);

  const shakeAndClear = useCallback(() => {
    reject(() => {
      valueRef.current = '';
      setValue('');
    });
  }, [reject]);

  const setBlocked = useCallback((next: boolean) => {
    blocked.current = next;
  }, []);

  return { value, push, pop, clear, shakeAndClear, shakeKey, failed, setBlocked };
}

export function PinIndicators({
  length,
  failed,
  shakeKey,
}: {
  length: number;
  failed: boolean;
  shakeKey: number;
}) {
  const offset = useSharedValue(0);

  useEffect(() => {
    if (shakeKey === 0) return;
    offset.value = withSequence(
      withTiming(-16, { duration: 42 }),
      withTiming(16, { duration: 42 }),
      withTiming(-12, { duration: 40 }),
      withTiming(12, { duration: 40 }),
      withTiming(-6, { duration: 36 }),
      withTiming(6, { duration: 36 }),
      withTiming(0, { duration: 36 }),
    );
  }, [offset, shakeKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <Animated.View style={[styles.dots, animatedStyle]}>
      {Array.from({ length: 4 }, (_, index) => {
        const filled = index < length;
        return (
          <View
            key={index}
            style={[
              styles.dot,
              filled && styles.dotFilled,
              failed && filled && styles.dotFailed,
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

interface PinKeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  disabled?: boolean;
  showBiometric?: boolean;
  biometricBusy?: boolean;
  onBiometric?: () => void;
  compact?: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export function PinKeypad({
  onDigit,
  onDelete,
  deleteDisabled = false,
  disabled = false,
  showBiometric = false,
  biometricBusy = false,
  onBiometric,
  compact = false,
}: PinKeypadProps) {
  const size = compact ? 68 : 78;
  const gap = compact ? 16 : 22;
  const fontSize = compact ? 28 : 32;

  return (
    <View style={[styles.pad, { gap }]}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={[styles.row, { gap }]}>
          {row.map((digit) => (
            <KeyButton
              key={digit}
              label={digit}
              size={size}
              fontSize={fontSize}
              disabled={disabled}
              onPress={() => onDigit(digit)}
            />
          ))}
        </View>
      ))}
      <View style={[styles.row, { gap }]}>
        {showBiometric ? (
          <KeyButton
            label=""
            accessibilityLabel="Биометрия"
            size={size}
            ghost
            disabled={disabled || biometricBusy}
            onPress={onBiometric}
          >
            <Ionicons name="finger-print" size={compact ? 28 : 32} color="#fff" />
          </KeyButton>
        ) : (
          <View style={{ width: size, height: size }} />
        )}
        <KeyButton
          label="0"
          size={size}
          fontSize={fontSize}
          disabled={disabled}
          onPress={() => onDigit('0')}
        />
        <KeyButton
          label=""
          accessibilityLabel="Стереть"
          size={size}
          ghost
          disabled={disabled || deleteDisabled}
          onPress={onDelete}
        >
          <Ionicons name="backspace-outline" size={compact ? 26 : 28} color="#fff" />
        </KeyButton>
      </View>
    </View>
  );
}

function KeyButton({
  label,
  accessibilityLabel,
  size,
  fontSize = 32,
  ghost = false,
  disabled = false,
  onPress,
  children,
}: {
  label: string;
  accessibilityLabel?: string;
  size: number;
  fontSize?: number;
  ghost?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        { width: size, height: size, borderRadius: size / 2 },
        ghost ? styles.keyGhost : styles.keySolid,
        pressed && !disabled && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}
    >
      {children ?? (
        <Text allowFontScaling={false} style={[styles.keyText, { fontSize }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    height: 24,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#48484A',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  dotFailed: {
    backgroundColor: '#FF453A',
    borderColor: '#FF453A',
  },
  pad: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySolid: {
    backgroundColor: '#2C2C2E',
  },
  keyGhost: {
    backgroundColor: 'transparent',
  },
  keyPressed: {
    backgroundColor: '#3A3A3C',
  },
  keyDisabled: {
    opacity: 0.35,
  },
  keyText: {
    color: '#FFFFFF',
    fontWeight: '400',
  },
});
