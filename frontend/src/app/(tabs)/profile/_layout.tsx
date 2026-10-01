/**
 * Stack navigator nested inside the Profile tab.
 * This keeps the bottom TabBar visible while navigating to the auth screen.
 */
import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="facts" />
      <Stack.Screen name="sessions" />
    </Stack>
  );
}
