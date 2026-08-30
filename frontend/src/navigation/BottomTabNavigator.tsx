import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';

// Импорты экранов
import Byte from '../screens/byte';
import StatisticsScreen from '../screens/StatisticsScreen';
import TodoScreen from '../screens/TodoScreen';
import NotesScreen from '../screens/NotesScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'help-circle';

          switch (route.name) {
            case 'Статистика':
              iconName = focused ? 'stats-chart' : 'stats-chart-outline';
              break;
            case 'Список дел':
              iconName = focused ? 'checkbox' : 'checkbox-outline';
              break;
            case 'Чат':
              iconName = focused ? 'chatbubble' : 'chatbubble-outline';
              break;
            case 'Заметки':
              iconName = focused ? 'document-text' : 'document-text-outline';
              break;
            case 'Профиль':
              iconName = focused ? 'person' : 'person-outline';
              break;
            default:
              iconName = 'help-circle';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#1C1C1E',
          borderTopColor: '#3A3A3C',
          height: Platform.OS === 'ios' ? 85 : 60,
          paddingBottom: Platform.OS === 'ios' ? 25 : 8,
          paddingTop: 8,
        },
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="Статистика" component={StatisticsScreen} />
      <Tab.Screen name="Список дел" component={TodoScreen} />
      <Tab.Screen name="Чат" component={Byte} />
      <Tab.Screen name="Заметки" component={NotesScreen} />
      <Tab.Screen name="Профиль" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export default BottomTabNavigator;