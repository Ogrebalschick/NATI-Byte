/**
 * Global bell in the top-right cluster. Opens a compact dropdown with
 * the 3 newest notifications, mark-all, and a link to the full history screen.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../../context/NotificationsContext';
import type { AppNotification, NotificationCategory } from '../../api/notificationsApi';

const CATEGORY_ICON: Record<NotificationCategory, keyof typeof Ionicons.glyphMap> = {
  tasks: 'checkbox-outline',
  reminders: 'alarm-outline',
  wishes: 'sparkles-outline',
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'сейчас';
  if (min < 60) return `${min} мин`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} ч`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'вчера';
  return `${days} дн`;
}

function PreviewRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, !item.is_read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <View style={[styles.rowIcon, !item.is_read && styles.rowIconUnread]}>
        <Ionicons
          name={CATEGORY_ICON[item.category]}
          size={15}
          color={item.is_read ? '#8E8E93' : '#0A84FF'}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, !item.is_read && styles.rowTitleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        {!!item.body && (
          <Text style={styles.rowText} numberOfLines={2}>{item.body}</Text>
        )}
      </View>
      <Text style={styles.rowTime}>{relativeTime(item.created_at)}</Text>
    </TouchableOpacity>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { unreadCount, latest, markRead, markAllRead, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const fade = useMemo(() => new Animated.Value(0), []);

  const openMenu = useCallback(() => {
    setOpen(true);
    void refresh();
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [fade, refresh]);

  const closeMenu = useCallback(() => {
    Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setOpen(false);
    });
  }, [fade]);

  const goAll = () => {
    closeMenu();
    setTimeout(() => router.push('/profile/notifications'), 80);
  };

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const panelWidth = Math.min(340, width - 24);

  return (
    <>
      <TouchableOpacity
        onPress={openMenu}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Уведомления"
        style={styles.bellBtn}
      >
        <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={18} color="#EBEBF5" />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={closeMenu}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <Animated.View
            style={[
              styles.panel,
              {
                top: insets.top + 48,
                right: 12,
                width: panelWidth,
                opacity: fade,
                transform: [{
                  translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
                }],
              },
            ]}
          >
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Уведомления</Text>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={() => { void markAllRead(); }} hitSlop={8}>
                  <Text style={styles.markAll}>Отметить всё</Text>
                </TouchableOpacity>
              )}
            </View>

            {latest.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={28} color="#636366" />
                <Text style={styles.emptyText}>Пока тихо</Text>
              </View>
            ) : (
              latest.map(item => (
                <PreviewRow
                  key={String(item.id)}
                  item={item}
                  onPress={() => {
                    if (!item.is_read) void markRead(item.id);
                  }}
                />
              ))
            )}

            <TouchableOpacity style={styles.seeAll} onPress={goAll} activeOpacity={0.75}>
              <Text style={styles.seeAllText}>Посмотреть все уведомления</Text>
              <Ionicons name="chevron-forward" size={14} color="#0A84FF" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(44, 44, 46, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#FF453A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    position: 'absolute',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3A3A3C',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  panelTitle: { color: '#EBEBF5', fontSize: 15, fontWeight: '700' },
  markAll: { color: '#0A84FF', fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 22, gap: 8 },
  emptyText: { color: '#636366', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowUnread: { backgroundColor: 'rgba(10,132,255,0.08)' },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  rowIconUnread: { backgroundColor: 'rgba(10,132,255,0.18)' },
  rowBody: { flex: 1 },
  rowTitle: { color: '#8E8E93', fontSize: 13, fontWeight: '600' },
  rowTitleUnread: { color: '#EBEBF5' },
  rowText: { color: '#636366', fontSize: 12, marginTop: 2, lineHeight: 16 },
  rowTime: { color: '#636366', fontSize: 10, marginTop: 2 },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2C2C2E',
  },
  seeAllText: { color: '#0A84FF', fontSize: 13, fontWeight: '600' },
});
