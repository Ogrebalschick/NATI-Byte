/**
 * Top-right chrome: bell (always) + StatusIndicator (guest / offline).
 * Bell sits to the left of the status badge, as specified.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificationBell } from './notifications/NotificationBell';
import { StatusIndicator } from './StatusIndicator';

export function TopRightChrome() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.cluster, { top: insets.top + 10 }]}>
      <NotificationBell />
      <StatusIndicator embedded />
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    position: 'absolute',
    right: 14,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
