// Полифилл Node-модуля punycode для markdown-it (Metro не включает Node stdlib)
import 'punycode/';

import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';

/**
 * Навигатор с встроенным auth-guard.
 * Должен рендериться ВНУТРИ AuthProvider, чтобы useAuth() работал.
 */
function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const inTabs = segments[0] === '(tabs)';
    const inAuth = segments[0] === 'auth';

    if (!isAuthenticated && !inAuth) {
      // Не авторизован — на экран входа
      router.replace('/auth');
    } else if (isAuthenticated && !inTabs) {
      // Авторизован — в табы
      router.replace('/(tabs)/chat');
    }
  }, [isAuthenticated, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* SDK 57: NavigationBar — декларативный компонент.
          style="dark" = тёмный фон, светлые иконки (аналог старого setButtonStyleAsync('light')).
          Прозрачный фон уже задан через androidStatusBar.backgroundColor в app.json. */}
      <NavigationBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}