import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';

// ─── Guest wall ────────────────────────────────────────────────────────────────

const GuestProfile = () => {
  const router = useRouter();

  return (
    <View style={styles.guestContainer}>
      <View style={styles.guestIconWrapper}>
        <Ionicons name="cloud-outline" size={64} color="#007AFF" />
      </View>

      <Text style={styles.guestTitle}>Гостевой режим</Text>

      <Text style={styles.guestSubtitle}>
        Войдите в аккаунт, чтобы синхронизировать историю чатов и список задач
        с облаком и не потерять данные.
      </Text>

      <View style={styles.featureList}>
        {[
          { icon: 'sync-outline',       label: 'Синхронизация между устройствами' },
          { icon: 'chatbubbles-outline', label: 'История чатов в облаке'           },
          { icon: 'checkbox-outline',    label: 'Резервная копия задач'            },
          { icon: 'stats-chart-outline', label: 'Статистика и аналитика'           },
        ].map(({ icon, label }) => (
          <View key={label} style={styles.featureRow}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color="#007AFF" />
            <Text style={styles.featureText}>{label}</Text>
          </View>
        ))}
      </View>

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

// ─── Delete-account modal (GitHub-style) ──────────────────────────────────────

interface DeleteModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteAccountModal = ({ visible, onClose, onConfirm }: DeleteModalProps) => {
  const CONFIRM_WORD = 'Удалить';
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setInputValue('');
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось удалить аккаунт');
    } finally {
      setLoading(false);
    }
  };

  const isConfirmed = inputValue === CONFIRM_WORD;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalDangerIcon}>
              <Ionicons name="warning-outline" size={28} color="#FF453A" />
            </View>
            <Text style={styles.modalTitle}>Удалить аккаунт</Text>
          </View>

          {/* Warning text */}
          <Text style={styles.modalWarning}>
            Вы уверены? Это действие{' '}
            <Text style={styles.modalWarningBold}>необратимо.</Text>
          </Text>
          <Text style={styles.modalBody}>
            Все ваши данные, история чатов и настройки будут безвозвратно удалены.
            Восстановить аккаунт после удаления невозможно.
          </Text>

          {/* Confirm word input */}
          <Text style={styles.modalPrompt}>
            Чтобы подтвердить, введите слово{' '}
            <Text style={styles.modalPromptWord}>«{CONFIRM_WORD}»</Text>{' '}
            в поле ниже:
          </Text>
          <TextInput
            style={[styles.modalInput, isConfirmed && styles.modalInputConfirmed]}
            placeholder={CONFIRM_WORD}
            placeholderTextColor="#636366"
            value={inputValue}
            onChangeText={setInputValue}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {/* Error */}
          {error && (
            <View style={styles.modalError}>
              <Text style={styles.modalErrorText}>{error}</Text>
            </View>
          )}

          {/* Actions */}
          <TouchableOpacity
            style={[styles.modalDeleteButton, (!isConfirmed || loading) && styles.modalDeleteButtonDisabled]}
            onPress={handleDelete}
            disabled={!isConfirmed || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.modalDeleteButtonText}>Я понимаю последствия, удалить аккаунт</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.modalCancelButton} onPress={handleClose}>
            <Text style={styles.modalCancelText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Authenticated profile ─────────────────────────────────────────────────────

const AuthenticatedProfile = () => {
  const { user, logout, deleteAccount, toggle2FA } = useAuth();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(user?.is_2fa_enabled ?? false);
  const [togglingFA, setTogglingFA] = useState(false);

  const handleLogout = () => {
    Alert.alert('Выход', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  };

  const handle2FAToggle = async (value: boolean) => {
    setIs2FAEnabled(value); // optimistic update
    setTogglingFA(true);
    try {
      await toggle2FA(value);
    } catch (err: any) {
      setIs2FAEnabled(!value); // rollback on error
      Alert.alert('Ошибка', err.message || 'Не удалось изменить настройку 2FA');
    } finally {
      setTogglingFA(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.containerContent}>
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
      </View>

      {/* Security section */}
      <Text style={styles.sectionLabel}>БЕЗОПАСНОСТЬ</Text>
      <View style={styles.menu}>
        {/* 2FA toggle */}
        <View style={styles.menuItemSwitch}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#fff" />
          <View style={styles.menuTextCol}>
            <Text style={styles.menuText}>Двухфакторная аутентификация</Text>
            <Text style={styles.menuSubtext}>Код на почту при каждом входе</Text>
          </View>
          <Switch
            value={is2FAEnabled}
            onValueChange={handle2FAToggle}
            disabled={togglingFA}
            trackColor={{ false: '#3a3a3c', true: '#007AFF' }}
            thumbColor="#fff"
          />
        </View>

        {/* Logout */}
        <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#ff3b30" />
          <Text style={[styles.menuText, styles.logoutText]}>Выйти</Text>
          <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
        </TouchableOpacity>
      </View>

      {/* Danger zone */}
      <Text style={styles.sectionLabel}>ОПАСНАЯ ЗОНА</Text>
      <View style={styles.menu}>
        <TouchableOpacity
          style={[styles.menuItem, styles.dangerItem]}
          onPress={() => setShowDeleteModal(true)}
        >
          <Ionicons name="trash-outline" size={24} color="#FF453A" />
          <Text style={[styles.menuText, styles.dangerText]}>Удалить аккаунт</Text>
          <Ionicons name="chevron-forward" size={20} color="#FF453A" />
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Версия 1.0.0</Text>
      </View>

      {/* Delete modal */}
      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={deleteAccount}
      />
    </ScrollView>
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
  guestTitle: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 12, letterSpacing: 0.3 },
  guestSubtitle: { fontSize: 15, color: '#8e8e93', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  featureList: {
    alignSelf: 'stretch',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  featureText: { fontSize: 15, color: '#d1d1d6' },
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
  signInIcon: { marginRight: 8 },
  signInText: { fontSize: 17, fontWeight: '600', color: '#fff', letterSpacing: 0.2 },
  guestNote: { fontSize: 12, color: '#636366', textAlign: 'center' },

  // ── Authenticated ──
  container: { flex: 1 },
  containerContent: { paddingHorizontal: 16, paddingBottom: 40 },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2D2E',
    marginBottom: 8,
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
  avatarText: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  name: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  email: { fontSize: 14, color: '#8e8e93' },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636366',
    letterSpacing: 0.8,
    marginTop: 28,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  menu: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2D2E',
  },
  menuItemSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2D2E',
    gap: 12,
  },
  menuTextCol: { flex: 1 },
  menuText: { flex: 1, fontSize: 16, color: '#fff', marginLeft: 12 },
  menuSubtext: { fontSize: 12, color: '#636366', marginLeft: 12, marginTop: 2 },
  logoutItem: { borderBottomWidth: 0 },
  logoutText: { color: '#ff3b30', flex: 1 },
  dangerItem: { borderBottomWidth: 0 },
  dangerText: { color: '#FF453A', flex: 1 },

  footer: { alignItems: 'center', paddingTop: 32 },
  footerText: { color: '#8e8e93', fontSize: 12 },

  // ── Delete modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2C2D2E',
  },
  modalHeader: { alignItems: 'center', marginBottom: 16 },
  modalDangerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,69,58,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  modalWarning: { fontSize: 15, color: '#fff', marginBottom: 8 },
  modalWarningBold: { color: '#FF453A', fontWeight: '700' },
  modalBody: { fontSize: 14, color: '#8e8e93', lineHeight: 20, marginBottom: 20 },
  modalPrompt: { fontSize: 14, color: '#d1d1d6', marginBottom: 10 },
  modalPromptWord: { color: '#FF453A', fontWeight: '700' },
  modalInput: {
    backgroundColor: '#2C2D2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginBottom: 16,
  },
  modalInputConfirmed: { borderColor: '#FF453A' },
  modalError: {
    backgroundColor: 'rgba(255,69,58,0.12)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  modalErrorText: { color: '#FF453A', fontSize: 13 },
  modalDeleteButton: {
    backgroundColor: '#FF453A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalDeleteButtonDisabled: { opacity: 0.35 },
  modalDeleteButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  modalCancelButton: { alignItems: 'center', paddingVertical: 10 },
  modalCancelText: { color: '#8e8e93', fontSize: 15 },
});
