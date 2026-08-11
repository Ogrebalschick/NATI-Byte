import { Stack } from "expo-router";
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      {/* StatusBar выносится за пределы Stack */}
      <StatusBar 
        translucent={true} 
        backgroundColor="transparent" 
        style="light" // или 'dark'
      />

      <Stack screenOptions={{ headerShown: false }}>
        {/* Внутри Stack остаются только Stack.Screen */}
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
    </>
  );
}