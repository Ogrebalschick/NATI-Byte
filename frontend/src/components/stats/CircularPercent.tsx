import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

interface CircularPercentProps {
  percent: number;
  size?: number;
  stroke?: number;
  caption?: string;
}

function ringColor(percent: number): string {
  if (percent >= 70) return '#30D158';
  if (percent >= 35) return '#0A84FF';
  if (percent > 0) return '#64D2FF';
  return '#3A3A3C';
}

export const CircularPercent = ({
  percent,
  size = 176,
  stroke = 14,
  caption = 'Общая успеваемость',
}: CircularPercentProps) => {
  const safe = Number.isFinite(percent) ? Math.max(0, percent) : 0;
  const ratio = Math.max(0, Math.min(safe / 100, 1));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - ratio);
  const color = ringColor(safe);

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
        <Text style={[styles.value, { color }]}>{Math.round(safe)}%</Text>
        {!!caption && <Text style={styles.caption}>{caption}</Text>}
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
  caption: {
    marginTop: 4,
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
