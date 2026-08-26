import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as NavigationBar from 'expo-navigation-bar';

export default function RootLayout() {
  useEffect(() => {
    // Устанавливаем прозрачный фон для панели навигации
    NavigationBar.setBackgroundColorAsync('transparent');
    // Чтобы кнопки были видны на светлом/тёмном фоне, установите цвет иконок
    NavigationBar.setButtonStyleAsync('light'); // или 'dark' в зависимости от вашего фона
    // Дополнительно можно задать поведение при скрытии (например, всегда показывать)
    // NavigationBar.setVisibilityAsync('visible');
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Главная' }} />
      <Stack.Screen 
        name="byte" 
        options={{ 
          title: 'Чат с Байтом', 
          presentation: 'modal', 
          animation: 'slide_from_bottom' 
        }} 
      />
    </Stack>
  );
}