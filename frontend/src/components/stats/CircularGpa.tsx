import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

interface CircularGpaProps {
  value: number | null;
  size?: number;
  stroke?: number;
}

function ringColor(gpa: number | null): string {
  if (gpa == null) return '#3A3A3C';
  if (gpa >= 4.5) return '#30D158';
  if (gpa >= 3.5) return '#0A84FF';
  if (gpa >= 3) return '#FFD60A';
  return '#FF453A';
}

export const CircularGpa = ({ value, size = 168, stroke = 12 }: CircularGpaProps) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = value == null ? 0 : Math.max(0, Math.min(value / 5, 1));
  const offset = c * (1 - ratio);
  const color = ringColor(value);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#2C2C2E"
          strokeWidth={stroke}
          fill="none"
        />
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      <View style={[styles.label, { pointerEvents: 'none' }]}>
        <Text style={[styles.value, { color }]}>{value == null ? '—' : value.toFixed(1)}</Text>
        <Text style={styles.caption}>
          {value == null ? 'из 5.0' : `из 5.0 (${Math.round((value / 5) * 100)}%)`}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  label: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  caption: { marginTop: 2, fontSize: 12, color: '#8E8E93', fontWeight: '600' },
});
