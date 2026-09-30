/**
 * @deprecated Этот файл оставлен для справки.
 * Начиная с Expo SDK 56, навигация перенесена в файловую структуру expo-router:
 *   src/app/(tabs)/_layout.tsx  ← замена этого навигатора
 *   src/app/(tabs)/chat.tsx, statistics.tsx, todos.tsx, notes.tsx, profile.tsx
 *
 * Импорты обновлены с @react-navigation/bottom-tabs
 * на expo-router/js-tabs (официальный модуль SDK 56+).
 */
import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

// createBottomTabNavigator больше не нужен — используем Tabs из expo-router/js-tabs
// в src/app/(tabs)/_layout.tsx. Ниже оставлена старая реализация для истории.
// Экраны теперь регистрируются файлами маршрутов, а не через component-пропс.

const BottomTabNavigator = () => {

  return (
    <></>
  );
};

export default BottomTabNavigator;