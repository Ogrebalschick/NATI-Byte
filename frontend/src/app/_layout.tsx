// Polyfill for Node's 'punycode' module — required by markdown-it, absent in Metro.
import 'punycode/';

// Per rules.md §3.1 — Guest Mode Support:
// The app must boot directly into the tab navigator. Account auth must never
// block initial access. The auth wall lives only inside ProfileScreen.
// AppLockGate is separate: it covers the UI on a cold start only when a device PIN is set.
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLockGate } from '../components/security/AppLockGate';
import { AuthProvider } from '../context/AuthContext';
import { NotificationsProvider } from '../context/NotificationsContext';
import { SyncStatusBanner } from '../components/SyncStatusBanner';
import { TopRightChrome } from '../components/TopRightChrome';
import { isExpoGo } from '../notifications/expoGo';

// expo-notifications throws on import inside Expo Go (SDK 53+, Android).
// Native handler is registered only in a development / production build.
if (!isExpoGo && Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  const stackInsets = { ...insets, top: 0 };

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // SDK 57 removed setBackgroundColorAsync / setPositionAsync / setButtonStyleAsync.
    // The only available runtime method is setStyle (synchronous):
    //   'dark'  = dark navigation bar with light (white) icons — matches our dark theme.
    // Background colour (#1C1C1E) is locked at build time via
    // app.json → "androidNavigationBar.backgroundColor".
    NavigationBar.setStyle('dark');
  }, []);

  return (
    <AuthProvider>
      <NotificationsProvider>
        <AppLockGate>
          <View style={[styles.column, { paddingTop: insets.top }]}>
            <SyncStatusBanner />
            <SafeAreaInsetsContext.Provider value={stackInsets}>
              <View style={styles.stack}>
                <Stack screenOptions={{ headerShown: false }}>
                  {/* index.tsx redirects straight to /(tabs)/chat for all users */}
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="auth" />
                </Stack>
              </View>
            </SafeAreaInsetsContext.Provider>
          </View>
          <TopRightChrome />
        </AppLockGate>
      </NotificationsProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    backgroundColor: '#17161B',
  },
  stack: {
    flex: 1,
  },
});
