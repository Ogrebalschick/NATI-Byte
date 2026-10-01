// Polyfill for Node's 'punycode' module — required by markdown-it, absent in Metro.
import 'punycode/';

// Per rules.md §3.1 — Guest Mode Support:
// The app must boot directly into the tab navigator. Account auth must never
// block initial access. The auth wall lives only inside ProfileScreen.
// AppLockGate is separate: it covers the UI on a cold start only when a device PIN is set.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import * as NavigationBar from 'expo-navigation-bar';
import { AppLockGate } from '../components/security/AppLockGate';
import { AuthProvider } from '../context/AuthContext';
import { SyncStatusBanner } from '../components/SyncStatusBanner';
import { StatusIndicator } from '../components/StatusIndicator';

export default function RootLayout() {
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
      <AppLockGate>
        <Stack screenOptions={{ headerShown: false }}>
          {/* index.tsx redirects straight to /(tabs)/chat for all users */}
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth" />
        </Stack>
        <SyncStatusBanner />
        <StatusIndicator />
      </AppLockGate>
    </AuthProvider>
  );
}
