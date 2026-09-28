import React from 'react';
import { useAuth } from '../context/AuthContext';
import BottomTabNavigator from './BottomTabNavigator';
import AuthScreen from '../screens/AuthScreen';

const AppNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Можно показать сплеш-экран
    return null;
  }

  return isAuthenticated ? <BottomTabNavigator /> : <AuthScreen />;
};

export default AppNavigator;