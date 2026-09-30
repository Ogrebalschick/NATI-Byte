import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { UserFact } from '../../api/factsApi';

export type SwipeDirection = 'left' | 'right' | 'up';

const SOURCE_LABEL: Record<string, string> = {
  cabinet: 'Личный кабинет',
  chat: 'Чаты',
  notes: 'Заметки',
  grades: 'Оценки',
};

const SWIPE_X = 110;
const SWIPE_Y = 90;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type SwipeHandle = {
  fling: (direction: SwipeDirection) => void;
};

function formatFactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function sourceTitle(source: string): string {
  return SOURCE_LABEL[source] ?? (source || 'Другое');
}

const FactFace = ({ fact }: { fact: UserFact }) => {
  const when = formatFactDate(fact.created_at);
  return (
    <>
      <Text style={styles.source}>{sourceTitle(fact.source)}</Text>
      <Text style={styles.factText}>{fact.fact_text}</Text>
      {!!when && <Text style={styles.date}>{when}</Text>}
    </>
  );
};

const SwipeCard = forwardRef<SwipeHandle, { fact: UserFact; onSwipe: (direction: SwipeDirection) => void }>(
  ({ fact, onSwipe }, ref) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const onSwipeRef = useRef(onSwipe);
    const locked = useRef(false);
    onSwipeRef.current = onSwipe;

    const fly = (direction: SwipeDirection) => {
      if (locked.current) return;
      locked.current = true;
      const toValue =
        direction === 'left'
          ? { x: -SCREEN_WIDTH * 1.25, y: 48 }
          : direction === 'right'
            ? { x: SCREEN_WIDTH * 1.25, y: 48 }
            : { x: 0, y: -SCREEN_HEIGHT * 0.75 };
      Animated.timing(pan, {
        toValue,
        duration: 280,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) onSwipeRef.current(direction);
        else locked.current = false;
      });
    };

    useImperativeHandle(ref, () => ({ fling: fly }), []);

    const responder = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, gesture) =>
            !locked.current && (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8),
          onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
          onPanResponderRelease: (_, gesture) => {
            const vertical = gesture.dy < -SWIPE_Y && Math.abs(gesture.dy) > Math.abs(gesture.dx);
            if (gesture.dx > SWIPE_X) fly('right');
            else if (gesture.dx < -SWIPE_X) fly('left');
            else if (vertical) fly('up');
            else {
              Animated.spring(pan, {
                toValue: { x: 0, y: 0 },
                useNativeDriver: false,
                bounciness: 8,
              }).start();
            }
          },
          onPanResponderTerminate: () => {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          },
        }),
      [pan],
    );

    const rotate = pan.x.interpolate({
      inputRange: [-220, 0, 220],
      outputRange: ['-14deg', '0deg', '14deg'],
      extrapolate: 'clamp',
    });
    const keepOpacity = pan.x.interpolate({
      inputRange: [0, 50, SWIPE_X],
      outputRange: [0, 0.35, 1],
      extrapolate: 'clamp',
    });
    const dropOpacity = pan.x.interpolate({
      inputRange: [-SWIPE_X, -50, 0],
      outputRange: [1, 0.35, 0],
      extrapolate: 'clamp',
    });
    const editOpacity = pan.y.interpolate({
      inputRange: [-SWIPE_Y, -40, 0],
      outputRange: [1, 0.35, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.card,
          styles.topCard,
          { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] },
        ]}
      >
        <FactFace fact={fact} />
        <Animated.Text style={[styles.stamp, styles.stampKeep, { opacity: keepOpacity }]}>Актуально</Animated.Text>
        <Animated.Text style={[styles.stamp, styles.stampDrop, { opacity: dropOpacity }]}>В корзину</Animated.Text>
        <Animated.Text style={[styles.stamp, styles.stampEdit, { opacity: editOpacity }]}>Изменить</Animated.Text>
      </Animated.View>
    );
  },
);

SwipeCard.displayName = 'SwipeCard';

const ConfettiBurst = () => {
  const pieces = useRef(Array.from({ length: 18 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    pieces.forEach((value, index) => {
      Animated.timing(value, {
        toValue: 1,
        duration: 1500,
        delay: index * 45,
        useNativeDriver: true,
      }).start();
    });
  }, [pieces]);

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {pieces.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.confetti,
            {
              left: `${8 + ((index * 17) % 84)}%`,
              backgroundColor: ['#30D158', '#FFD60A', '#0A84FF', '#FF453A', '#BF5AF2', '#64D2FF'][index % 6],
              opacity: value.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-24, 460] }) },
                { rotate: value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${index % 2 ? 220 : -200}deg`] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

type DeckProps = {
  deck: UserFact[];
  done: boolean;
  settling?: boolean;
  editing: UserFact | null;
  onSwipe: (fact: UserFact, direction: SwipeDirection) => void;
  onSaveEdit: (fact: UserFact, text: string) => Promise<void>;
  onCancelEdit: (fact: UserFact) => void;
};

export const FactSwipeDeck = ({ deck, done, settling = false, editing, onSwipe, onSaveEdit, onCancelEdit }: DeckProps) => {
  const cardRef = useRef<SwipeHandle>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const visible = deck.slice(0, 3);
  const top = visible[0];

  useEffect(() => {
    if (!editing) return;
    setDraft(editing.fact_text);
    setEditError(null);
    setSaving(false);
  }, [editing]);

  const save = async () => {
    if (!editing || saving) return;
    const text = draft.trim();
    if (!text) {
      setEditError('Текст факта не должен быть пустым');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await onSaveEdit(editing, text);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Не удалось обновить факт');
      setSaving(false);
    }
  };

  if (done) {
    return (
      <View style={styles.doneWrap}>
        <ConfettiBurst />
        <Text style={styles.doneTitle}>Ура! Твой профиль полностью актуален на ближайшие полгода 🚀</Text>
      </View>
    );
  }

  if (!top) {
    return (
      <View style={styles.doneWrap}>
        {settling ? (
          <ActivityIndicator color="#0A84FF" />
        ) : (
          <Text style={styles.doneTitle}>В колоде пока нет фактов</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        {[...visible].reverse().map(fact => {
          const depth = visible.findIndex(item => item.id === fact.id);
          if (depth === 0) {
            return <SwipeCard key={fact.id} ref={cardRef} fact={fact} onSwipe={direction => onSwipe(fact, direction)} />;
          }
          return (
            <View
              key={fact.id}
              pointerEvents="none"
              style={[
                styles.card,
                styles.backCard,
                { transform: [{ scale: 1 - depth * 0.045 }, { translateY: depth * 12 }] },
              ]}
            >
              <FactFace fact={fact} />
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, styles.actionDrop]}
          onPress={() => cardRef.current?.fling('left')}
          accessibilityRole="button"
          accessibilityLabel="Удалить факт"
        >
          <Ionicons name="close" size={28} color="#FF453A" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, styles.actionEdit]}
          onPress={() => cardRef.current?.fling('up')}
          accessibilityRole="button"
          accessibilityLabel="Изменить факт"
        >
          <Ionicons name="pencil" size={24} color="#0A84FF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, styles.actionKeep]}
          onPress={() => cardRef.current?.fling('right')}
          accessibilityRole="button"
          accessibilityLabel="Факт актуален"
        >
          <Ionicons name="checkmark" size={30} color="#30D158" />
        </TouchableOpacity>
      </View>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => editing && onCancelEdit(editing)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => editing && !saving && onCancelEdit(editing)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Изменить факт</Text>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={400}
              placeholder="Текст факта"
              placeholderTextColor="#636366"
              editable={!saving}
            />
            {!!editError && <Text style={styles.editError}>{editError}</Text>}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={() => { void save(); }}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Сохранить</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => editing && !saving && onCancelEdit(editing)}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  stage: { flex: 1, minHeight: 380, marginTop: 8 },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 8,
    minHeight: 320,
    borderRadius: 24,
    backgroundColor: '#232228',
    paddingHorizontal: 22,
    paddingVertical: 26,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
    justifyContent: 'center',
  },
  topCard: { zIndex: 2 },
  backCard: { zIndex: 1 },
  source: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  factText: { color: '#F2F2F7', fontSize: 26, lineHeight: 34, fontWeight: '700' },
  date: { color: '#636366', fontSize: 14, marginTop: 22 },
  stamp: {
    position: 'absolute',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.4,
    borderWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  stampKeep: { top: 24, left: 20, color: '#30D158', borderColor: '#30D158', transform: [{ rotate: '-12deg' }] },
  stampDrop: { top: 24, right: 20, color: '#FF453A', borderColor: '#FF453A', transform: [{ rotate: '12deg' }] },
  stampEdit: { bottom: 28, left: 0, right: 0, textAlign: 'center', color: '#0A84FF', borderColor: '#0A84FF' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 22,
    paddingTop: 8,
    paddingBottom: 12,
  },
  action: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
  },
  actionDrop: { borderColor: 'rgba(255, 69, 58, 0.45)' },
  actionEdit: { borderColor: 'rgba(10, 132, 255, 0.45)' },
  actionKeep: { borderColor: 'rgba(48, 209, 88, 0.45)' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, overflow: 'hidden' },
  doneTitle: { color: '#fff', fontSize: 22, lineHeight: 30, fontWeight: '700', textAlign: 'center' },
  confettiLayer: { ...StyleSheet.absoluteFill },
  confetti: { position: 'absolute', top: 0, width: 8, height: 14, borderRadius: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3C',
    marginBottom: 14,
  },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 14 },
  input: {
    minHeight: 110,
    borderRadius: 14,
    backgroundColor: '#2C2D2E',
    color: '#fff',
    fontSize: 17,
    lineHeight: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  editError: { color: '#FF8A84', fontSize: 13, marginTop: 8 },
  saveButton: {
    marginTop: 16,
    backgroundColor: '#0A84FF',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelButton: { marginTop: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#8e8e93', fontSize: 16 },
});
