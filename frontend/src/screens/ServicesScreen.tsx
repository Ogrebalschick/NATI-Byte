import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';

type ServiceRoute = '/todos' | '/statistics';

interface ServiceTile {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route?: ServiceRoute;
}

const SOON_MESSAGE = 'Сервис появится в следующих обновлениях BYTE 🚀';

const SERVICES: ServiceTile[] = [
  { id: 'todos', title: 'Трекер дел', icon: 'checkbox', color: '#0A84FF', route: '/todos' },
  { id: 'achievements', title: 'Достижения', icon: 'trophy', color: '#FFD60A', route: '/statistics' },
  { id: 'letters', title: 'Письма счастья', icon: 'mail', color: '#FF9F0A' },
  { id: 'weather', title: 'Погода', icon: 'partly-sunny', color: '#64D2FF' },
  { id: 'goals', title: 'Цели', icon: 'locate', color: '#FF453A' },
  { id: 'leisure', title: 'Активный досуг', icon: 'game-controller', color: '#30D158' },
  { id: 'evening', title: 'Вечер для себя', icon: 'book', color: '#BF5AF2' },
  { id: 'aware', title: 'А ты в курсе?', icon: 'text', color: '#64D2FF' },
  { id: 'rating', title: 'Рейтинг', icon: 'podium', color: '#FFD60A' },
  { id: 'flood', title: 'Флудилка', icon: 'chatbubbles', color: '#FF375F' },
];

const ServicesScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const itemWidth = (Dimensions.get('window').width - 48) / 3;
  const [toast, setToast] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const showSoon = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setToast(SOON_MESSAGE);
    hideTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const openService = (service: ServiceTile) => {
    if (service.route) {
      router.navigate(service.route);
      return;
    }
    showSoon();
  };

  return (
    <ScreenWrapper>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: tabBarHeight + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Сервисы</Text>
        <View style={styles.grid}>
          {SERVICES.map((service) => (
            <TouchableOpacity
              key={service.id}
              style={[styles.tile, { width: itemWidth }]}
              activeOpacity={0.82}
              onPress={() => openService(service)}
              accessibilityRole="button"
              accessibilityLabel={service.title}
            >
              <Ionicons name={service.icon} size={28} color={service.color} />
              <Text style={styles.tileLabel}>{service.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {toast ? (
        <View style={[styles.toast, { bottom: tabBarHeight + 12, pointerEvents: 'none' }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 108,
  },
  tileLabel: {
    color: '#EBEBF5',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 10,
  },
  toast: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  toastText: {
    color: '#F2F2F7',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ServicesScreen;
