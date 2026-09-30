import React, { useState, useEffect, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Eye, EyeOff } from 'lucide-react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../context/AuthContext';
import { NstuImportModal } from '../components/NstuImportModal';

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

// ─── Change-password modal ─────────────────────────────────────────────────────

interface ChangePasswordModalProps {
  visible: boolean;
  loadingRequest: boolean;
  onClose: () => void;
  onConfirm: (code: string, newPassword: string) => Promise<void>;
  onResend: () => Promise<void>;
}

const ChangePasswordModal = ({
  visible,
  loadingRequest,
  onClose,
  onConfirm,
  onResend,
}: ChangePasswordModalProps) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const mismatchHint = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    passwordsMatch &&
    newPassword.length >= 6 &&
    code.trim().length === 6 &&
    !loading &&
    !loadingRequest;

  const resetFields = () => {
    setNewPassword('');
    setConfirmPassword('');
    setCode('');
    setShowNew(false);
    setShowConfirm(false);
    setError(null);
  };

  const handleClose = () => {
    resetFields();
    onClose();
  };

  const handleResend = async () => {
    setError(null);
    try {
      await onResend();
    } catch (err: any) {
      setError(err.message || 'Не удалось отправить код повторно');
    }
  };

  const handleSubmit = async () => {
    if (!passwordsMatch) {
      setError('Пароли не совпадают');
      return;
    }
    if (newPassword.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(code.trim(), newPassword);
      resetFields();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось изменить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalBox}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={styles.modalLockIcon}>
                <Ionicons name="lock-closed-outline" size={28} color="#007AFF" />
              </View>
              <Text style={styles.modalTitle}>Изменить пароль</Text>
            </View>

            <Text style={styles.modalBody}>
              Код подтверждения отправлен на вашу почту. Введите новый пароль и 6-значный код из письма.
            </Text>

            {loadingRequest && (
              <Text style={styles.modalHint}>Отправляем код на почту…</Text>
            )}

            {/* New password */}
            <Text style={styles.modalFieldLabel}>Новый пароль</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Минимум 6 символов"
                placeholderTextColor="#636366"
                value={newPassword}
                onChangeText={text => { setNewPassword(text); setError(null); }}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowNew(prev => !prev)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showNew ? <EyeOff size={20} color="#8e8e93" /> : <Eye size={20} color="#8e8e93" />}
              </TouchableOpacity>
            </View>

            {/* Confirm password */}
            <Text style={styles.modalFieldLabel}>Повторите новый пароль</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Повторите пароль"
                placeholderTextColor="#636366"
                value={confirmPassword}
                onChangeText={text => { setConfirmPassword(text); setError(null); }}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirm(prev => !prev)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showConfirm ? <EyeOff size={20} color="#8e8e93" /> : <Eye size={20} color="#8e8e93" />}
              </TouchableOpacity>
            </View>
            {mismatchHint && (
              <Text style={styles.fieldError}>Пароли не совпадают</Text>
            )}

            {/* Email code */}
            <Text style={styles.modalFieldLabel}>Код из письма</Text>
            <TextInput
              style={[styles.modalInput, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor="#636366"
              value={code}
              onChangeText={text => { setCode(text.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              keyboardType="number-pad"
              maxLength={6}
            />
            <Text style={styles.modalHint}>Код действителен 10 минут</Text>

            {error && (
              <View style={styles.modalError}>
                <Text style={styles.modalErrorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.modalSaveButton, !canSubmit && styles.modalDeleteButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.modalDeleteButtonText}>Сохранить новый пароль</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={handleResend}
              disabled={loadingRequest}
            >
              <Text style={styles.resendText}>Отправить код повторно</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelButton} onPress={handleClose}>
              <Text style={styles.modalCancelText}>Отмена</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

interface CreatePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}

const CreatePasswordModal = ({ visible, onClose, onSubmit }: CreatePasswordModalProps) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 6 && password === confirm && !loading;

  const handleClose = () => {
    setPassword('');
    setConfirm('');
    setError(null);
    setShowNew(false);
    setShowConfirm(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(password);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <View style={styles.modalLockIcon}>
              <Ionicons name="key-outline" size={28} color="#007AFF" />
            </View>
            <Text style={styles.modalTitle}>Создать пароль BYTE</Text>
          </View>
          <Text style={styles.modalBody}>
            После этого вы сможете входить в приложение без сайта университета.
          </Text>

          <Text style={styles.modalFieldLabel}>Придумайте пароль</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Минимум 6 символов"
              placeholderTextColor="#636366"
              value={password}
              onChangeText={text => { setPassword(text); setError(null); }}
              secureTextEntry={!showNew}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowNew(p => !p)}>
              {showNew ? <EyeOff size={20} color="#8e8e93" /> : <Eye size={20} color="#8e8e93" />}
            </TouchableOpacity>
          </View>

          <Text style={styles.modalFieldLabel}>Повторите пароль</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Повторите пароль"
              placeholderTextColor="#636366"
              value={confirm}
              onChangeText={text => { setConfirm(text); setError(null); }}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirm(p => !p)}>
              {showConfirm ? <EyeOff size={20} color="#8e8e93" /> : <Eye size={20} color="#8e8e93" />}
            </TouchableOpacity>
          </View>
          {mismatch && <Text style={styles.fieldError}>Пароли не совпадают</Text>}

          {error && (
            <View style={styles.modalError}>
              <Text style={styles.modalErrorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.modalSaveButton, !canSubmit && styles.modalDeleteButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.modalDeleteButtonText}>Сохранить пароль</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalCancelButton} onPress={handleClose}>
            <Text style={styles.modalCancelText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const AuthenticatedProfile = () => {
  const router = useRouter();
  const {
    user,
    logout,
    deleteAccount,
    toggle2FA,
    requestPasswordReset,
    confirmPasswordReset,
    parseCabinet,
    setPassword,
    markLastSync,
    showReviewBanner,
    confirmProfileReview,
  } = useAuth();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [passwordRequestLoading, setPasswordRequestLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isWebViewVisible, setIsWebViewVisible] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(user?.is_2fa_enabled ?? false);
  const [togglingFA, setTogglingFA] = useState(false);
  const nstuSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [successMessage]);

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

  const openPasswordModal = async () => {
    setShowPasswordModal(true);
    setPasswordRequestLoading(true);
    try {
      await requestPasswordReset();
    } catch (err: any) {
      setShowPasswordModal(false);
      Alert.alert('Ошибка', err.message || 'Не удалось отправить код на почту');
    } finally {
      setPasswordRequestLoading(false);
    }
  };

  const resendPasswordCode = async () => {
    setPasswordRequestLoading(true);
    try {
      await requestPasswordReset();
    } finally {
      setPasswordRequestLoading(false);
    }
  };

  const handlePasswordConfirm = async (code: string, newPassword: string) => {
    await confirmPasswordReset(code, newPassword);
    setSuccessMessage('Пароль успешно изменён');
  };

  const handleReviewStillValid = async () => {
    try {
      await confirmProfileReview();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить отметку. Попробуйте ещё раз.');
    }
  };

  const handleNstuFinished = () => {
    setIsWebViewVisible(false);
    markLastSync().catch(() => {});
    setSuccessMessage('Профиль и расписание НГТУ успешно импортированы!');
    if (nstuSuccessTimer.current) clearTimeout(nstuSuccessTimer.current);
    nstuSuccessTimer.current = setTimeout(() => setSuccessMessage(null), 6000);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.containerContent}>
      {showReviewBanner && (
        <View style={styles.reviewBanner}>
          <View style={styles.reviewTitleRow}>
            <Ionicons name="alert-circle" size={20} color="#FF9F0A" />
            <Text style={styles.reviewTitle}>
              Пора проверить актуальность данных в профиле! ИИ BYTE помнит старую информацию
            </Text>
          </View>
          <View style={styles.reviewActions}>
            <TouchableOpacity
              style={styles.reviewCheck}
              onPress={() => router.push('/profile/facts')}
              accessibilityRole="button"
            >
              <Text style={styles.reviewCheckText}>Проверить</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reviewOk}
              onPress={handleReviewStillValid}
              accessibilityRole="button"
            >
              <Text style={styles.reviewOkText}>Всё актуально</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {successMessage && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#30D158" />
          <Text style={styles.successBannerText}>{successMessage}</Text>
        </View>
      )}

      {user?.has_password === false && (
        <View style={styles.nstuBanner}>
          <Ionicons name="information-circle-outline" size={22} color="#FFD60A" />
          <View style={styles.nstuBannerTextCol}>
            <Text style={styles.nstuBannerText}>
              Вы вошли через NSTU ID. Установите пароль для BYTE, чтобы входить напрямую без авторизации на сайте университета.
            </Text>
            <TouchableOpacity style={styles.nstuBannerButton} onPress={() => setShowCreatePassword(true)}>
              <Text style={styles.nstuBannerButtonText}>Создать пароль</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.full_name?.charAt(0)?.toUpperCase()
              || user?.name?.charAt(0)?.toUpperCase()
              || '?'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.full_name || user?.name || 'Пользователь'}</Text>
        {!!user?.student_group && (
          <Text style={styles.groupBadge}>Группа {user.student_group}</Text>
        )}
        <Text style={styles.email}>{user?.email ?? ''}</Text>
      </View>

      {/* Menu */}
      <View style={styles.menu}>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/profile/facts')}>
          <Ionicons name="sparkles-outline" size={24} color="#fff" />
          <View style={styles.menuTextCol}>
            <Text style={styles.menuText}>Память ИИ</Text>
            <Text style={styles.menuSubtext}>Факты, которые BYTE о вас хранит</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
        </TouchableOpacity>

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

        <TouchableOpacity style={styles.menuItem} onPress={() => setIsWebViewVisible(true)}>
          <Ionicons name="school-outline" size={24} color="#fff" />
          <View style={styles.menuTextCol}>
            <Text style={styles.menuText}>Импортировать данные из Личного кабинета НГТУ</Text>
            <Text style={styles.menuSubtext}>
              {user?.is_synced_with_nstu ? 'Данные уже синхронизированы' : 'Профиль и расписание YourNeti'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
        </TouchableOpacity>
      </View>

      {/* Security section */}
      <Text style={styles.sectionLabel}>БЕЗОПАСНОСТЬ</Text>
      <View style={styles.menu}>
        <TouchableOpacity style={styles.menuItem} onPress={openPasswordModal}>
          <Ionicons name="key-outline" size={24} color="#fff" />
          <Text style={styles.menuText}>Изменить пароль</Text>
          <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
        </TouchableOpacity>

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

      <NstuImportModal
        visible={isWebViewVisible}
        onClose={() => setIsWebViewVisible(false)}
        onScraped={parseCabinet}
        onFinished={handleNstuFinished}
      />

      <CreatePasswordModal
        visible={showCreatePassword}
        onClose={() => setShowCreatePassword(false)}
        onSubmit={async (pwd) => {
          await setPassword(pwd);
          setSuccessMessage('Пароль успешно установлен');
        }}
      />

      <ChangePasswordModal
        visible={showPasswordModal}
        loadingRequest={passwordRequestLoading}
        onClose={() => setShowPasswordModal(false)}
        onConfirm={handlePasswordConfirm}
        onResend={resendPasswordCode}
      />

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
  groupBadge: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
    marginBottom: 4,
  },

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

  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(48, 209, 88, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.4)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  successBannerText: { color: '#30D158', fontSize: 15, fontWeight: '600', flex: 1 },
  nstuBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(255, 214, 10, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.35)',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  nstuBannerTextCol: { flex: 1 },
  nstuBannerText: { color: '#FFE08A', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  nstuBannerButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFD60A',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  nstuBannerButtonText: { color: '#1C1C1E', fontSize: 14, fontWeight: '700' },
  reviewBanner: {
    backgroundColor: 'rgba(255, 159, 10, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.45)',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    gap: 12,
  },
  reviewTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewTitle: { flex: 1, color: '#FFD60A', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  reviewActions: { flexDirection: 'row', gap: 8 },
  reviewCheck: {
    flex: 1,
    backgroundColor: '#FF9F0A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  reviewCheckText: { color: '#1C1C1E', fontSize: 14, fontWeight: '700' },
  reviewOk: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.55)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  reviewOkText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },

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
  modalLockIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,122,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalFieldLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  modalHint: { color: '#8e8e93', fontSize: 12, marginBottom: 12 },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2D2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  eyeButton: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  fieldError: { color: '#FF453A', fontSize: 12, marginTop: -6, marginBottom: 10 },
  codeInput: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSaveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 8,
  },
  resendText: { color: '#007AFF', fontSize: 14 },
});
