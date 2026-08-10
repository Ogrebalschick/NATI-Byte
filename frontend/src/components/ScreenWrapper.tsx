import React from 'react';
import { StyleSheet, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Определяем типы для пропсов, чтобы можно было передавать кастомные стили при необходимости
interface ScreenWrapperProps extends ViewProps {
  children: React.ReactNode;
  bg?: string; // возможность быстро менять цвет фона
}

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({ 
  children, 
  style, 
  bg = '#17161B', // цвет фона по умолчанию
  ...props 
}) => {
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }, style]} {...props}>
      {children}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1, // Растягивается на весь экран
    paddingHorizontal: 16, // Базовые отступы по бокам
    paddingTop: 10,
    color:'#fff'
  },
});