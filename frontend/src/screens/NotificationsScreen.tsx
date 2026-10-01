import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  apiTriggerMagic,
  notificationEmoji,
  resolveNotificationImageUrl,
  type AppNotification,
  type NotificationCategory,
} from '../api/notificationsApi';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FilterKey = 'all' | NotificationCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'tasks', label: 'Задачи' },
  { key: 'reminders', label: 'Напоминания' },
  { key: 'wishes', label: 'Пожелания' },
];

const CATEGORY_META: Record<NotificationCategory, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = {
  tasks:     { label: 'Задачи',      icon: 'checkbox-outline', color: '#0A84FF' },
  reminders: { label: 'Напоминания', icon: 'alarm-outline',    color: '#FF9F0A' },
  wishes:    { label: 'Пожелания',   icon: 'sparkles-outline', color: '#FFD60A' },
};

type DateGroup = 'today' | 'yesterday' | 'week' | 'older';

const GROUP_LABEL: Record<DateGroup, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  week: 'На этой неделе',
  older: 'Ранее',
};

const GROUP_ORDER: DateGroup[] = ['today', 'yesterday', 'week', 'older'];

function startOfDay(d: Date): Date {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}

function groupOf(iso: string): DateGroup {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'older';
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return 'week';
  return 'older';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function cardLabel(item: AppNotification): string {
  if (item.category === 'wishes' || item.push_slot === 'morning') return 'Утреннее пожелание';
  if (item.push_slot === 'evening') return 'Перед сном';
  return CATEGORY_META[item.category].label;
}

function WishImage({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri }}
      style={styles.wishImage}
      contentFit="cover"
      transition={180}
      recyclingKey={uri}
      onError={() => setFailed(true)}
      accessibilityLabel="Картинка пожелания"
    />
  );
}

function NotificationCard({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  const meta = CATEGORY_META[item.category];
  const emoji = notificationEmoji(item);
  const imageUri = resolveNotificationImageUrl(item.image_url);
  const isMagic = item.category === 'wishes' || item.push_slot === 'evening';
  const accent = item.push_slot === 'evening' ? '#64D2FF' : meta.color;
  return (
    <TouchableOpacity
      style={[
        styles.card,
        !item.is_read && styles.cardUnread,
        item.category === 'wishes' && styles.cardWish,
        item.push_slot === 'evening' && styles.cardEvening,
      ]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      {!item.is_read && <View style={[styles.unreadBar, { backgroundColor: accent }]} />}
      <View style={[styles.cardIcon, { backgroundColor: `${accent}22` }]}>
        {emoji ? (
          <Text style={styles.cardEmoji}>{emoji}</Text>
        ) : (
          <Ionicons name={meta.icon} size={16} color={accent} />
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, !item.is_read && styles.cardTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardTime}>{formatTime(item.created_at)}</Text>
        </View>
        {!!item.body && (
          <Text style={[styles.cardText, isMagic && styles.cardTextMagic]} numberOfLines={isMagic ? undefined : 3}>
            {item.body}
          </Text>
        )}
        {imageUri ? <WishImage key={imageUri} uri={imageUri} /> : null}
        <Text style={[styles.cardCat, { color: accent }]}>{cardLabel(item)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { token } = useAuth();
  const { items, isLoading, unreadCount, markRead, markAllRead, prependNotification } = useNotifications();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);

  const onGenerate = async () => {
    if (!token) {
      setMagicError('Войди в аккаунт — Байтик пишет пожелания только своим студентам.');
      return;
    }
    setMagicBusy(true);
    setMagicError(null);
    try {
      const created = await apiTriggerMagic(token);
      setFilter('all');
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      prependNotification(created);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ y: 0, animated: true });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сгенерировать пожелание';
      setMagicError(message);
    } finally {
      setMagicBusy(false);
    }
  };

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter(i => i.category === filter)),
    [items, filter],
  );

  const grouped = useMemo(() => {
    const buckets: Record<DateGroup, AppNotification[]> = {
      today: [], yesterday: [], week: [], older: [],
    };
    for (const item of filtered) buckets[groupOf(item.created_at)].push(item);
    return buckets;
  }, [filtered]);

  return (
    <ScreenWrapper bg="#17161B" style={styles.screen}>
      <ScrollView
        ref={listRef}
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: tabBarHeight + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Назад"
        >
          <Ionicons name="chevron-back" size={22} color="#0A84FF" />
          <Text style={styles.backText}>Назад</Text>
        </TouchableOpacity>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Уведомления</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={() => { void markAllRead(); }} hitSlop={8}>
              <Text style={styles.markAll}>Отметить всё</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.subtitle}>Дедлайны, напоминания и пожелания BYTE</Text>

        <TouchableOpacity
          style={[styles.magicBtn, magicBusy && styles.magicBtnBusy]}
          onPress={() => { void onGenerate(); }}
          disabled={magicBusy}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Сгенерировать ИИ-пуш"
        >
          {magicBusy ? <ActivityIndicator color="#1C1C1E" size="small" /> : null}
          <Text style={styles.magicBtnText}>
            {magicBusy ? 'Байтик пишет…' : 'Сгенерировать ИИ-пуш ✨'}
          </Text>
        </TouchableOpacity>
        {!!magicError && <Text style={styles.magicError}>{magicError}</Text>}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {FILTERS.map(chip => {
            const on = filter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                activeOpacity={0.75}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isLoading && items.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#0A84FF" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color="#636366" />
            <Text style={styles.emptyTitle}>Нет уведомлений</Text>
            <Text style={styles.emptySub}>
              Когда появится дедлайн или пожелание, оно окажется здесь
            </Text>
          </View>
        ) : (
          GROUP_ORDER.map(group => {
            const list = grouped[group];
            if (list.length === 0) return null;
            return (
              <View key={group} style={styles.section}>
                <Text style={styles.sectionLabel}>{GROUP_LABEL[group]}</Text>
                {list.map(item => (
                  <NotificationCard
                    key={String(item.id)}
                    item={item}
                    onPress={() => {
                      if (!item.is_read) void markRead(item.id);
                    }}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  backText: { color: '#0A84FF', fontSize: 17, marginLeft: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  markAll: { color: '#0A84FF', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  subtitle: { color: '#8e8e93', fontSize: 15, lineHeight: 21, marginTop: 6, marginBottom: 14 },
  magicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFD60A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  magicBtnBusy: { opacity: 0.85 },
  magicBtnText: { color: '#1C1C1E', fontSize: 15, fontWeight: '700' },
  magicError: { color: '#FF453A', fontSize: 13, lineHeight: 18, marginTop: -6, marginBottom: 12 },
  chips: { flexDirection: 'row', gap: 8, paddingBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  chipOn: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  chipText: { color: '#8E8E93', fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  centered: { paddingTop: 48, alignItems: 'center' },
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 },
  emptyTitle: { color: '#EBEBF5', fontSize: 17, fontWeight: '600', marginTop: 12 },
  emptySub: { color: '#636366', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  section: { marginBottom: 18 },
  sectionLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    overflow: 'hidden',
    gap: 10,
  },
  cardUnread: {
    backgroundColor: '#232228',
  },
  cardWish: {
    borderWidth: 1,
    borderColor: '#FFD60A33',
  },
  cardEvening: {
    borderWidth: 1,
    borderColor: '#5E5CE644',
  },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#0A84FF',
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  cardEmoji: { fontSize: 18, lineHeight: 22 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: '#C7C7CC', fontSize: 15, fontWeight: '600' },
  cardTitleUnread: { color: '#EBEBF5' },
  cardTime: { color: '#636366', fontSize: 11, fontWeight: '500' },
  cardText: { color: '#8E8E93', fontSize: 13, lineHeight: 18, marginTop: 4 },
  cardTextMagic: { color: '#EBEBF5', fontSize: 15, lineHeight: 21 },
  wishImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    marginTop: 10,
    backgroundColor: '#2C2C2E',
  },
  cardCat: { fontSize: 11, fontWeight: '600', marginTop: 8 },
});
