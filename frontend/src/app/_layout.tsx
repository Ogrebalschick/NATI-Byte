import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as NavigationBar from 'expo-navigation-bar';
import BottomTabNavigator from '../navigation/BottomTabNavigator';

export default function RootLayout() {
  useEffect(() => {
    NavigationBar.setBackgroundColorAsync('transparent');
    NavigationBar.setButtonStyleAsync('light');
  }, []);

  // Возвращаем BottomTabNavigator как корневой компонент
  return <BottomTabNavigator />;
}