import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';

// ─── Guest wall ────────────────────────────────────────────────────────────────
// Per rules.md §3.4: the auth wall is enforced here (Profile screen),
// not at the root layout level.

const GuestProfile = () => {
  const router = useRouter();

  return (
    <View style={styles.guestContainer}>
      {/* Icon */}
      <View style={styles.guestIconWrapper}>
        <Ionicons name="cloud-outline" size={64} color="#007AFF" />
      </View>

      {/* Heading */}
      <Text style={styles.guestTitle}>Гостевой режим</Text>

      {/* Description */}
      <Text style={styles.guestSubtitle}>
        Войдите в аккаунт, чтобы синхронизировать историю чатов и список задач
        с облаком и не потерять данные.
      </Text>

      {/* Features list */}
      <View style={styles.featureList}>
        {[
          { icon: 'sync-outline',       label: 'Синхронизация между устройствами' },
          { icon: 'chatbubbles-outline', label: 'История чатов в облаке'           },
          { icon: 'checkbox-outline',    label: 'Резервная копия задач'            },
          { icon: 'stats-chart-outline', label: 'Статистика и аналитика'           },
        ].map(({ icon, label }) => (
          <View key={label} style={styles.featureRow}>
            <Ionicons
              name={icon as keyof typeof Ionicons.glyphMap}
              size={20}
              color="#007AFF"
            />
            <Text style={styles.featureText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={styles.signInButton}
        activeOpacity={0.8}
        onPress={() => router.push('/profile/auth')}
      >
        <Ionicons name="log-in-outline" size={20} color="#fff" style={styles.signInIcon} />
        <Text style={styles.signInText}>Войти в аккаунт</Text>
      </TouchableOpacity>

      <Text style={styles.guestNote}>
        Локальные данные сохранятся и будут объединены с аккаунтом при входе.
      </Text>
    </View>
  );
};

// ─── Authenticated profile ─────────────────────────────────────────────────────

const AuthenticatedProfile = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Выход', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name ?? 'Пользователь'}</Text>
        <Text style={styles.email}>{user?.email ?? ''}</Text>
      </View>

      {/* Menu */}
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

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Версия 1.0.0</Text>
      </View>
    </View>
  );
};

// ─── Root component ────────────────────────────────────────────────────────────

const ProfileScreen = () => {
  const { isAuthenticated } = useAuth();

  return (
    <ScreenWrapper bg="#17161B">
      {isAuthenticated ? <AuthenticatedProfile /> : <GuestProfile />}
    </ScreenWrapper>
  );
};

export default ProfileScreen;

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Guest ──
  guestContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  guestIconWrapper: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  guestTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  guestSubtitle: {
    fontSize: 15,
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  featureList: {
    alignSelf: 'stretch',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#d1d1d6',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  signInIcon: {
    marginRight: 8,
  },
  signInText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.2,
  },
  guestNote: {
    fontSize: 12,
    color: '#636366',
    textAlign: 'center',
  },

  // ── Authenticated ──
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
