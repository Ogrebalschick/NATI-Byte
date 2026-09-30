import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface AddSubjectModalProps {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; target_score: number; max_score: number }) => Promise<void>;
}

export const AddSubjectModal = ({ visible, loading, onClose, onSubmit }: AddSubjectModalProps) => {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [max, setMax] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setTarget('');
      setMax('');
      setError(null);
    }
  }, [visible]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    const targetScore = Number(target.replace(',', '.'));
    const maxScore = Number(max.replace(',', '.'));
    if (!trimmed) {
      setError('Введите название предмета');
      return;
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      setError('Максимум баллов должен быть больше 0');
      return;
    }
    if (!Number.isFinite(targetScore) || targetScore < 0) {
      setError('Желаемый балл не может быть отрицательным');
      return;
    }
    setError(null);
    try {
      await onSubmit({ name: trimmed, target_score: targetScore, max_score: maxScore });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить предмет');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.box}>
          <Text style={styles.title}>Новый предмет</Text>
          <Text style={styles.hint}>Задайте потолок и цель — например 40 и 24 для зачёта.</Text>

          <Text style={styles.label}>Название</Text>
          <TextInput
            style={styles.input}
            placeholder="Физика"
            placeholderTextColor="#636366"
            value={name}
            onChangeText={text => {
              setName(text);
              setError(null);
            }}
          />

          <Text style={styles.label}>Желаемый балл</Text>
          <TextInput
            style={styles.input}
            placeholder="24"
            placeholderTextColor="#636366"
            keyboardType="decimal-pad"
            value={target}
            onChangeText={text => {
              setTarget(text);
              setError(null);
            }}
          />

          <Text style={styles.label}>Максимальный балл</Text>
          <TextInput
            style={styles.input}
            placeholder="40"
            placeholderTextColor="#636366"
            keyboardType="decimal-pad"
            value={max}
            onChangeText={text => {
              setMax(text);
              setError(null);
            }}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.ghost} onPress={onClose} disabled={loading}>
              <Text style={styles.ghostText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primary} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Добавить</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

function todayRu(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${now.getFullYear()}`;
}

/** Empty input means today. Returns an ISO timestamp or null when the text is invalid. */
export function parseScoreDate(value: string): string | null {
  const raw = value.trim();
  const source = raw || todayRu();
  const match = source.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.toISOString();
}

interface AddScoreModalProps {
  visible: boolean;
  subjectName?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (input: { score: number; description: string | null; created_at: string }) => Promise<void>;
}

export const AddScoreModal = ({
  visible,
  subjectName,
  loading,
  onClose,
  onSubmit,
}: AddScoreModalProps) => {
  const [score, setScore] = useState('');
  const [description, setDescription] = useState('');
  const [dateText, setDateText] = useState(todayRu());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setScore('');
      setDescription('');
      setDateText(todayRu());
      setError(null);
    }
  }, [visible]);

  const handleSubmit = async () => {
    const value = Number(score.replace(',', '.'));
    if (!Number.isFinite(value) || value === 0) {
      setError('Введите количество баллов, не равное нулю');
      return;
    }
    const createdAt = parseScoreDate(dateText);
    if (!createdAt) {
      setError('Дата в формате ДД.ММ.ГГГГ. Пустое поле — сегодня.');
      return;
    }
    setError(null);
    try {
      await onSubmit({
        score: value,
        description: description.trim() || null,
        created_at: createdAt,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось добавить баллы');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.box}>
          <Text style={styles.title}>Добавить баллы</Text>
          <Text style={styles.hint}>{subjectName || 'Предмет'}</Text>

          <Text style={styles.label}>Баллы</Text>
          <TextInput
            style={styles.input}
            placeholder="5"
            placeholderTextColor="#636366"
            keyboardType="decimal-pad"
            value={score}
            onChangeText={text => {
              setScore(text);
              setError(null);
            }}
          />

          <Text style={styles.label}>Дата</Text>
          <TextInput
            style={styles.input}
            placeholder={todayRu()}
            placeholderTextColor="#636366"
            keyboardType="numbers-and-punctuation"
            value={dateText}
            onChangeText={text => {
              setDateText(text);
              setError(null);
            }}
          />
          <Text style={styles.dateHint}>Оставь пустым — сохранится сегодняшняя дата</Text>

          <Text style={styles.label}>Описание</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Вышел к доске"
            placeholderTextColor="#636366"
            value={description}
            onChangeText={text => {
              setDescription(text);
              setError(null);
            }}
            multiline
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.ghost} onPress={onClose} disabled={loading}>
              <Text style={styles.ghostText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primary} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Сохранить</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  box: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 20,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  hint: { color: '#8E8E93', fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 14 },
  label: { color: '#C7C7CC', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  dateHint: { color: '#636366', fontSize: 12, marginTop: 6 },
  error: { color: '#FF453A', fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  ghost: { paddingVertical: 12, paddingHorizontal: 14 },
  ghostText: { color: '#8E8E93', fontSize: 16, fontWeight: '600' },
  primary: {
    backgroundColor: '#0A84FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 120,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
