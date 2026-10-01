import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { syncGuestRhythmNotifications } from '../../notifications/dayRhythm';
import {
  DEFAULT_SLEEP,
  DEFAULT_WAKE,
  clockToDate,
  formatClock,
  isClock,
  loadGuestDayRhythm,
  saveGuestDayRhythm,
} from '../../storage/dayRhythmStorage';

type Slot = 'wake' | 'sleep';

interface DayRhythmModalProps {
  visible: boolean;
  onClose: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function readError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось сохранить режим дня';
}

export function DayRhythmModal({ visible, onClose }: DayRhythmModalProps) {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, updateDayRhythm } = useAuth();
  const [wake, setWake] = useState(DEFAULT_WAKE);
  const [sleep, setSleep] = useState(DEFAULT_SLEEP);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setPicking(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      if (isAuthenticated) {
        if (!cancelled) {
          setWake(isClock(user?.wake_time) ? user.wake_time : DEFAULT_WAKE);
          setSleep(isClock(user?.sleep_time) ? user.sleep_time : DEFAULT_SLEEP);
        }
        return;
      }
      const stored = await loadGuestDayRhythm();
      if (!cancelled) {
        setWake(stored.wake);
        setSleep(stored.sleep);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, isAuthenticated, user?.wake_time, user?.sleep_time]);

  const applyDate = (slot: Slot, date: Date) => {
    const next = formatClock(date);
    if (slot === 'wake') setWake(next);
    else setSleep(next);
  };

  const handleValueChange = (slot: Slot) => (_event: DateTimePickerChangeEvent, date: Date) => {
    applyDate(slot, date);
    if (Platform.OS === 'android') setPicking(null);
  };

  const handleDismiss = () => {
    setPicking(null);
  };

  const toggleSlot = (slot: Slot) => {
    setPicking((current) => (current === slot ? null : slot));
  };

  const handleSave = async () => {
    if (!isClock(wake) || !isClock(sleep)) {
      setError('Выберите время в формате ЧЧ:ММ');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isAuthenticated) {
        await updateDayRhythm(wake, sleep);
      } else {
        await saveGuestDayRhythm(wake, sleep);
        await syncGuestRhythmNotifications(wake, sleep);
      }
      onClose();
    } catch (err) {
      setError(readError(err));
    } finally {
      setSaving(false);
    }
  };

  const renderIosPicker = (slot: Slot, value: string, fallback: string) => {
    if (picking !== slot || Platform.OS !== 'ios') return null;
    return (
      <DateTimePicker
        value={clockToDate(value, fallback)}
        mode="time"
        display="spinner"
        is24Hour
        locale="ru-RU"
        themeVariant="dark"
        textColor="#FFFFFF"
        onValueChange={handleValueChange(slot)}
        onDismiss={handleDismiss}
        style={styles.spinner}
      />
    );
  };

  const androidPicker = Platform.OS === 'android' && picking ? (
    <DateTimePicker
      value={clockToDate(
        picking === 'wake' ? wake : sleep,
        picking === 'wake' ? DEFAULT_WAKE : DEFAULT_SLEEP,
      )}
      mode="time"
      display="spinner"
      is24Hour
      onValueChange={handleValueChange(picking)}
      onDismiss={handleDismiss}
    />
  ) : null;

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Режим дня</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color="#EBEBF5" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <TimeCard
              label="Время пробуждения"
              value={wake}
              accent="#FFD60A"
              active={picking === 'wake'}
              onPress={() => toggleSlot('wake')}
            />
            {renderIosPicker('wake', wake, DEFAULT_WAKE)}
            {picking === 'wake' && Platform.OS === 'web' ? (
              <WebWheel value={wake} onChange={(next) => setWake(next)} />
            ) : null}

            <TimeCard
              label="Время отхода ко сну"
              value={sleep}
              accent="#64D2FF"
              active={picking === 'sleep'}
              onPress={() => toggleSlot('sleep')}
            />
            {renderIosPicker('sleep', sleep, DEFAULT_SLEEP)}
            {picking === 'sleep' && Platform.OS === 'web' ? (
              <WebWheel value={sleep} onChange={(next) => setSleep(next)} />
            ) : null}

            <Text style={styles.caption}>
              Байтик подстроит утренние пожелания, прогноз погоды и вечернюю поддержку под твои биоритмы, чтобы не тревожить сон
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Сохранить режим дня"
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#1C1C1E" />
            ) : (
              <Text style={styles.saveText}>Сохранить</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    {androidPicker}
    </>
  );
}

function TimeCard({
  label,
  value,
  accent,
  active,
  onPress,
}: {
  label: string;
  value: string;
  accent: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, active && { borderColor: accent }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
    >
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardTime, { color: accent }]}>{value}</Text>
      <Text style={styles.cardHint}>Нажмите, чтобы выбрать часы и минуты</Text>
    </TouchableOpacity>
  );
}

function WebWheel({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [hour, minute] = value.split(':');
  const setPart = (nextHour: string, nextMinute: string) => {
    onChange(`${nextHour}:${nextMinute}`);
  };

  return (
    <View style={styles.wheelRow}>
      <WheelColumn
        values={HOURS}
        selected={hour}
        onSelect={(next) => setPart(next, minute)}
      />
      <Text style={styles.wheelColon}>:</Text>
      <WheelColumn
        values={MINUTES}
        selected={minute}
        onSelect={(next) => setPart(hour, next)}
      />
    </View>
  );
}

function WheelColumn({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView style={styles.wheel} showsVerticalScrollIndicator={false} nestedScrollEnabled>
      {values.map((item) => {
        const active = item === selected;
        return (
          <TouchableOpacity
            key={item}
            style={[styles.wheelItem, active && styles.wheelItemActive]}
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={item}
          >
            <Text style={[styles.wheelText, active && styles.wheelTextActive]}>{item}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#121214',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 8 },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#2C2C2E',
    minHeight: 112,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.5)',
  },
  cardLabel: { color: '#AEAEB2', fontSize: 15, fontWeight: '600' },
  cardTime: {
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  cardHint: { color: '#636366', fontSize: 13, marginTop: 4 },
  spinner: { height: 180, marginTop: 4 },
  caption: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
    marginBottom: 8,
  },
  error: { color: '#FF453A', fontSize: 14, marginBottom: 8 },
  saveBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#FFD60A',
    borderRadius: 16,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveText: { color: '#1C1C1E', fontSize: 18, fontWeight: '700' },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  wheel: {
    height: 196,
    width: 96,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
  },
  wheelColon: { color: '#FFFFFF', fontSize: 32, fontWeight: '700' },
  wheelItem: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemActive: { backgroundColor: '#3A3A3C' },
  wheelText: { color: '#8E8E93', fontSize: 22, fontWeight: '600' },
  wheelTextActive: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
});
