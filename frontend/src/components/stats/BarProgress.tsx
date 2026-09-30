import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface BarProgressProps {
  label: string;
  value: number;
  max?: number;
  tint?: string;
}

export const BarProgress = ({ label, value, max = 100, tint = '#0A84FF' }: BarProgressProps) => {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(value / safeMax, 1));
  const pct = Math.round(ratio * 100);

  return (
    <View style={styles.row}>
      <View style={styles.meta}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.pct}>
          {value}/{safeMax}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { gap: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { flex: 1, color: '#EBEBF0', fontSize: 14, fontWeight: '600' },
  pct: { color: '#8E8E93', fontSize: 12, fontWeight: '600' },
  track: {
    height: 8,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 8 },
});
