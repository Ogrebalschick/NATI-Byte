import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type GradeTone = 'five' | 'four' | 'three' | 'pass' | 'fail' | 'neutral';

export function gradeTone(raw: string | null | undefined): GradeTone {
  if (!raw) return 'neutral';
  const g = raw.trim().toLowerCase().replace(/\./g, '');
  if (['5', 'отлично', 'отл', 'a', 'a+'].includes(g)) return 'five';
  if (['4', 'хорошо', 'хор', 'b', 'b+'].includes(g)) return 'four';
  if (['3', 'удовлетворительно', 'удовл', 'уд', 'c'].includes(g)) return 'three';
  if (['зачет', 'зачёт', 'зачтено', 'зач'].includes(g)) return 'pass';
  if (['2', 'неудовлетворительно', 'неуд', 'не зачтено', 'н/я', 'н я'].includes(g)) return 'fail';
  if (g.includes('зачет') || g.includes('зачёт')) return 'pass';
  if (g.startsWith('отл')) return 'five';
  if (g.startsWith('хор')) return 'four';
  return 'neutral';
}

const TONE_STYLE: Record<GradeTone, { bg: string; fg: string }> = {
  five: { bg: 'rgba(48,209,88,0.18)', fg: '#30D158' },
  four: { bg: 'rgba(10,132,255,0.18)', fg: '#0A84FF' },
  three: { bg: 'rgba(255,214,10,0.18)', fg: '#FFD60A' },
  pass: { bg: 'rgba(191,90,242,0.18)', fg: '#BF5AF2' },
  fail: { bg: 'rgba(255,69,58,0.18)', fg: '#FF453A' },
  neutral: { bg: 'rgba(142,142,147,0.16)', fg: '#C7C7CC' },
};

export const GradeBadge = ({ grade }: { grade: string }) => {
  const tone = gradeTone(grade);
  const palette = TONE_STYLE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.fg }]}>{grade}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '700' },
});
