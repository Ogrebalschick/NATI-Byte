import React from 'react';
import { StyleSheet, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenWrapperProps extends ViewProps {
  children: React.ReactNode;
  bg?: string;
}

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({ 
  children, 
  style, 
  bg = '#17161B',
  ...props 
}) => {
  return (
    <SafeAreaView 
      edges={['left', 'right', 'bottom']} // 👈 добавляем bottom
      style={[styles.container, { backgroundColor: bg }, style]} 
      {...props} 
    >
      {children}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
});