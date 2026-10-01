import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  CUSTOM_API_IP_KEY,
  getApiUrl,
  normalizeApiHost,
  resetApiUrl,
  updateApiUrl,
} from '../api/config';

interface DevServerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DevServerModal({ visible, onClose }: DevServerModalProps) {
  const [ip, setIp] = useState('');
  const [currentUrl, setCurrentUrl] = useState(getApiUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCurrentUrl(getApiUrl());
    setIp('');
    setError(null);
    setBusy(null);
  }, [visible]);

  const onSave = async () => {
    if (busy) return;
    const draft = ip.trim();
    if (!draft) {
      setError('Введите IP компьютера');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      updateApiUrl(draft);
      await AsyncStorage.setItem(CUSTOM_API_IP_KEY, normalizeApiHost(draft));
      setCurrentUrl(getApiUrl());
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить IP');
      setBusy(null);
    }
  };

  const onReset = async () => {
    if (busy) return;
    setBusy('reset');
    setError(null);
    try {
      await resetApiUrl();
      setCurrentUrl(getApiUrl());
      setIp('');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Не удалось сбросить IP');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Режим разработчика: Настройка сервера</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Закрыть">
              <Ionicons name="close" size={22} color="#8E8E93" />
            </Pressable>
          </View>

          <Text style={styles.currentLabel}>Текущий API URL:</Text>
          <Text style={styles.currentUrl} selectable>
            {currentUrl}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Введите IP компьютера"
            placeholderTextColor="#636366"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            value={ip}
            onChangeText={text => {
              setIp(text);
              setError(null);
            }}
            editable={!busy}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.resetButton, busy && styles.buttonDisabled]}
              onPress={() => {
                void onReset();
              }}
              disabled={busy}
            >
              {busy === 'reset' ? (
                <ActivityIndicator color="#FF453A" />
              ) : (
                <Text style={styles.resetText}>Сбросить</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.button, styles.saveButton, busy && styles.buttonDisabled]}
              onPress={() => {
                void onSave();
              }}
              disabled={busy}
            >
              {busy === 'save' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Сохранить</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3A3A3C',
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  currentLabel: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 16,
  },
  currentUrl: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
  },
  error: {
    color: '#FF453A',
    fontSize: 13,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  resetButton: {
    backgroundColor: '#2C2C2E',
  },
  resetText: {
    color: '#FF453A',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: '#0A84FF',
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
