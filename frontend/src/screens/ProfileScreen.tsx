import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';

const ProfileScreen = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Выход',
      'Вы уверены, что хотите выйти?',
      [
        { text: 'Отмена', style: 'cancel' },
        { 
          text: 'Выйти', 
          style: 'destructive',
          onPress: logout 
        },
      ]
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.name || 'Гость'}</Text>
          <Text style={styles.email}>{user?.email || 'Не авторизован'}</Text>
        </View>

        <View style={styles.menu}>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="person-outline" size={24} color="#fff" />
            <Text style={styles.menuText}>Редактировать профиль</Text>
            <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="chatbubbles-outline" size={24} color="#fff" />
            <Text style={styles.menuText}>Мои чаты</Text>
            <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="stats-chart-outline" size={24} color="#fff" />
            <Text style={styles.menuText}>Статистика</Text>
            <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.menuItem, styles.logoutItem]} 
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={24} color="#ff3b30" />
            <Text style={[styles.menuText, styles.logoutText]}>Выйти</Text>
            <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Версия 1.0.0</Text>
        </View>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2D2E',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#8e8e93',
  },
  menu: {
    marginTop: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2D2E',
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    marginLeft: 12,
  },
  logoutItem: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2C2D2E',
  },
  logoutText: {
    color: '#ff3b30',
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 20,
  },
  footerText: {
    color: '#8e8e93',
    fontSize: 12,
  },
});

export default ProfileScreen;