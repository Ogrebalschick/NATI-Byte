import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ensureBiometricsAvailable } from '../../security/biometricAuth';
import {
  clearUserPin,
  getBiometricsEnabled,
  getUserPin,
  setBiometricsEnabled,
  setUserPin,
} from '../../storage/appLockStorage';
import { PinIndicators, PinKeypad, usePinBuffer } from './PinPad';

type SetupStep = 'idle' | 'create' | 'confirm';

interface AppLockSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AppLockSettingsModal({ visible, onClose }: AppLockSettingsModalProps) {
  const insets = useSafeAreaInsets();
  const buffer = usePinBuffer();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [biometricsOn, setBiometricsOn] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setSetupStep('idle');
    setDraft('');
    setError(null);
    setStatus(null);
    buffer.clear();

    (async () => {
      try {
        const pin = await getUserPin();
        const bio = pin ? await getBiometricsEnabled() : false;
        if (cancelled) return;
        setPinSet(Boolean(pin));
        setBiometricsOn(bio);
      } catch (loadError) {
        console.warn('Failed to load app-lock settings', loadError);
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить настройки');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, buffer.clear]);

  const cancelSetup = () => {
    setSetupStep('idle');
    setDraft('');
    setError(null);
    buffer.clear();
  };

  const onPinSwitch = (next: boolean) => {
    if (busy) return;
    setStatus(null);
    setError(null);
    if (next) {
      setSetupStep('create');
      setDraft('');
      buffer.clear();
      return;
    }
    if (!pinSet) {
      cancelSetup();
      return;
    }
    Alert.alert(
      'Отключить PIN-код?',
      'Защита приложения и вход по биометрии будут выключены.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отключить',
          style: 'destructive',
          onPress: () => {
            void disablePin();
          },
        },
      ],
    );
  };

  const disablePin = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearUserPin();
      setPinSet(false);
      setBiometricsOn(false);
      cancelSetup();
      setStatus('Защита приложения выключена');
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : 'Не удалось отключить PIN-код');
    } finally {
      setBusy(false);
    }
  };

  const persistPin = async (code: string) => {
    setBusy(true);
    buffer.setBlocked(true);
    setError(null);
    try {
      await setUserPin(code);
      setPinSet(true);
      setSetupStep('idle');
      setDraft('');
      buffer.clear();
      setStatus('PIN-код сохранён. Он запросится при следующем запуске.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить PIN-код');
      buffer.shakeAndClear();
    } finally {
      buffer.setBlocked(false);
      setBusy(false);
    }
  };

  const onDigit = (digit: string) => {
    const next = buffer.push(digit);
    if (!next) return;
    if (next.length === 1) setError(null);
    if (next.length < 4) return;
    if (setupStep === 'create') {
      setDraft(next);
      buffer.clear();
      setSetupStep('confirm');
      return;
    }
    if (next !== draft) {
      setError('Коды не совпадают');
      buffer.shakeAndClear();
      return;
    }
    void persistPin(next);
  };

  const onBioSwitch = async (next: boolean) => {
    if (busy || !pinSet) return;
    setStatus(null);
    setError(null);
    setBiometricsOn(next);
    setBusy(true);
    try {
      if (next) await ensureBiometricsAvailable();
      await setBiometricsEnabled(next);
      setStatus(next ? 'Биометрия включена' : 'Биометрия выключена');
    } catch (bioError) {
      setBiometricsOn(!next);
      setError(bioError instanceof Error ? bioError.message : 'Не удалось изменить биометрию');
    } finally {
      setBusy(false);
    }
  };

  const setupTitle = setupStep === 'confirm'
    ? 'Повторите PIN-код'
    : pinSet
      ? 'Новый PIN-код'
      : 'Придумайте PIN-код';

  const pinSwitchOn = pinSet || setupStep !== 'idle';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Защита приложения</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Закрыть">
              <Ionicons name="close" size={22} color="#8E8E93" />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color="#007AFF" style={styles.loader} />
          ) : (
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <Text style={styles.lead}>
                PIN-код запрашивается при каждом запуске приложения.
              </Text>

              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>Вход по PIN-коду</Text>
                    <Text style={styles.rowSubtitle}>4 цифры при открытии приложения</Text>
                  </View>
                  <Switch
                    value={pinSwitchOn}
                    onValueChange={onPinSwitch}
                    disabled={busy || (pinSet && setupStep !== 'idle')}
                    trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
                    thumbColor="#fff"
                  />
                </View>

                {pinSet && setupStep === 'idle' && (
                  <>
                    <View style={styles.divider} />
                    <Pressable
                      style={styles.linkRow}
                      onPress={() => {
                        setStatus(null);
                        setError(null);
                        setDraft('');
                        buffer.clear();
                        setSetupStep('create');
                      }}
                      disabled={busy}
                    >
                      <Text style={styles.linkText}>Сменить PIN-код</Text>
                      <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
                    </Pressable>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle}>Использовать отпечаток пальца / Face ID</Text>
                        <Text style={styles.rowSubtitle}>Вместо ввода PIN при запуске</Text>
                      </View>
                      <Switch
                        value={biometricsOn}
                        onValueChange={(value) => {
                          void onBioSwitch(value);
                        }}
                        disabled={busy}
                        trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
                        thumbColor="#fff"
                      />
                    </View>
                  </>
                )}
              </View>

              {setupStep !== 'idle' && (
                <View style={styles.setup}>
                  <Text style={styles.setupTitle}>{setupTitle}</Text>
                  <PinIndicators
                    length={buffer.value.length}
                    failed={buffer.failed}
                    shakeKey={buffer.shakeKey}
                  />
                  <Text style={styles.setupError}>{error ?? ' '}</Text>
                  <View style={styles.keypadWrap}>
                    <PinKeypad
                      compact
                      disabled={busy}
                      onDigit={onDigit}
                      onDelete={buffer.pop}
                      deleteDisabled={buffer.value.length === 0}
                    />
                  </View>
                  <Pressable onPress={cancelSetup} disabled={busy} style={styles.cancelSetup}>
                    <Text style={styles.cancelSetupText}>Отмена</Text>
                  </Pressable>
                </View>
              )}

              {setupStep === 'idle' && error && <Text style={styles.error}>{error}</Text>}
              {status && !error && <Text style={styles.status}>{status}</Text>}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3C',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  loader: {
    marginVertical: 36,
  },
  content: {
    paddingBottom: 8,
  },
  lead: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  rowSubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#3A3A3C',
    marginLeft: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  setup: {
    alignItems: 'center',
    marginTop: 22,
  },
  setupTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 18,
  },
  setupError: {
    minHeight: 20,
    marginTop: 14,
    color: '#FF453A',
    fontSize: 14,
    textAlign: 'center',
  },
  keypadWrap: {
    marginTop: 22,
  },
  cancelSetup: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  cancelSetupText: {
    color: '#8E8E93',
    fontSize: 16,
  },
  error: {
    color: '#FF453A',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  status: {
    color: '#30D158',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
});
