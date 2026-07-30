import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }}>
      {/* headerShown: false отключает стандартную верхнюю плашку навигации */}
      <Stack.Screen name="index" options={{ title: 'Главная' }} />
      <Stack.Screen name="byte" options={{ title: 'Чат с Байтом', presentation: 'modal', animation: 'slide_from_bottom', }} />
    </Stack>;
}
