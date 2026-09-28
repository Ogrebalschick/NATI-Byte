/**
 * Табовый навигатор — expo-router файловая замена BottomTabNavigator.tsx.
 * Импорты идут из expo-router/js-tabs (официальный модуль SDK 56+),
 * а не из устаревшего @react-navigation/bottom-tabs.
 */
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'help-circle';

          switch (route.name) {
            case 'statistics':
              iconName = focused ? 'stats-chart' : 'stats-chart-outline';
              break;
            case 'todos':
              iconName = focused ? 'checkbox' : 'checkbox-outline';
              break;
            case 'chat':
              iconName = focused ? 'chatbubble' : 'chatbubble-outline';
              break;
            case 'notes':
              iconName = focused ? 'document-text' : 'document-text-outline';
              break;
            case 'profile':
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
      <Tabs.Screen name="statistics" options={{ title: 'Статистика' }} />
      <Tabs.Screen name="todos"      options={{ title: 'Список дел' }} />
      <Tabs.Screen name="chat"       options={{ title: 'Чат' }} />
      <Tabs.Screen name="notes"      options={{ title: 'Заметки' }} />
      <Tabs.Screen name="profile"    options={{ title: 'Профиль' }} />
    </Tabs>
  );
}
