/**
 * Табовый навигатор — expo-router файловая замена BottomTabNavigator.tsx.
 * Импорты идут из expo-router/js-tabs и expo-router/react-navigation (SDK 56+),
 * а не из пакетов @react-navigation/*.
 */
import { useState } from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { PlatformPressable } from 'expo-router/react-navigation';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DevServerModal } from '../../components/DevServerModal';

export default function TabLayout() {
  // Must be called at component level — hooks cannot live inside screenOptions callback.
  // insets.bottom === height of the Android system nav bar (gesture strip / hw buttons).
  // On devices without a software nav bar this equals 0, so no extra space is added.
  const insets = useSafeAreaInsets();
  const [serverModalVisible, setServerModalVisible] = useState(false);

  // Base heights before adding the system inset.
  const BASE_HEIGHT = Platform.OS === 'ios' ? 60 : 65;
  const tabBarHeight = BASE_HEIGHT + insets.bottom;

  return (
    <>
      <Tabs
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'help-circle';

            switch (route.name) {
              case 'services':
                iconName = focused ? 'apps-sharp' : 'apps-outline';
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
          // height = icon area (BASE_HEIGHT) + system nav bar inset.
          // paddingBottom = insets.bottom lifts icons above the system bar.
          // borderTopWidth: 0 + elevation: 0 — seamless edge, no divider or shadow.
          tabBarStyle: {
            backgroundColor: '#1C1C1E',
            borderTopWidth: 0,
            elevation: 0,
            height: tabBarHeight,
            paddingBottom: insets.bottom,
            paddingTop: 8,
          },
          headerShown: false,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
        })}
      >
        <Tabs.Screen
          name="services"
          options={{ title: 'Сервисы', tabBarLabel: 'Сервисы' }}
        />
        <Tabs.Screen name="todos" options={{ title: 'Список дел' }} />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Чат',
            tabBarButton: (props) => (
              <PlatformPressable
                accessibilityRole={props.accessibilityRole}
                accessibilityState={props.accessibilityState}
                accessibilityLabel={props.accessibilityLabel}
                testID={props.testID}
                href={props.href}
                style={props.style}
                onPress={props.onPress}
                delayLongPress={450}
                onLongPress={() => setServerModalVisible(true)}
              >
                {props.children}
              </PlatformPressable>
            ),
          }}
        />
        <Tabs.Screen name="notes" options={{ title: 'Заметки' }} />
        <Tabs.Screen name="profile" options={{ title: 'Профиль' }} />
        <Tabs.Screen name="statistics" options={{ href: null }} />
      </Tabs>
      <DevServerModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
      />
    </>
  );
}
