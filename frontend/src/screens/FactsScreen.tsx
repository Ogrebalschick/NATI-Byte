import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteAllFacts, deleteFact, fetchFactGroups, updateFact, type FactGroups, type UserFact } from '../api/factsApi';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { FactSwipeDeck, type SwipeDirection } from '../components/facts/FactSwipeDeck';
import { useAuth } from '../context/AuthContext';

const SOURCE_ORDER = ['cabinet', 'chat', 'notes', 'grades'] as const;

const SOURCE_LABEL: Record<string, { title: string; icon: keyof typeof Ionicons.glyphMap }> = {
  cabinet: { title: 'Из личного кабинета', icon: 'school-outline' },
  chat: { title: 'Из чатов', icon: 'chatbubbles-outline' },
  notes: { title: 'Из заметок', icon: 'document-text-outline' },
  grades: { title: 'Из оценок', icon: 'stats-chart-outline' },
};

function sourceMeta(source: string) {
  return SOURCE_LABEL[source] ?? { title: source || 'Другое', icon: 'ellipse-outline' as const };
}

function flattenFacts(groups: FactGroups): UserFact[] {
  return orderedSources(groups).flatMap(source => groups[source] ?? []);
}

function withUpdatedFact(groups: FactGroups, factId: number, factText: string): FactGroups {
  const next: FactGroups = {};
  for (const [source, items] of Object.entries(groups)) {
    next[source] = items.map(item => (item.id === factId ? { ...item, fact_text: factText } : item));
  }
  return next;
}

function withoutFact(groups: FactGroups, factId: number): FactGroups {
  const next: FactGroups = {};
  for (const [source, items] of Object.entries(groups)) {
    next[source] = items.filter(item => item.id !== factId);
  }
  return next;
}

function countFacts(groups: FactGroups): number {
  return Object.values(groups).reduce((sum, items) => sum + items.length, 0);
}

function orderedSources(groups: FactGroups): string[] {
  const filled = (source: string) => (groups[source]?.length ?? 0) > 0;
  const known = SOURCE_ORDER.filter(filled);
  const extra = Object.keys(groups).filter(source => !SOURCE_ORDER.includes(source as (typeof SOURCE_ORDER)[number]) && filled(source));
  return [...known, ...extra];
}

const FactsScreen = () => {
  const { isAuthenticated, isLoading, token } = useAuth();

  return (
    <ScreenWrapper bg="#17161B" style={styles.screen}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#007AFF" />
        </View>
      ) : isAuthenticated && token ? (
        <FactsList token={token} />
      ) : (
        <GuestFacts />
      )}
    </ScreenWrapper>
  );
};

const GuestFacts = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.guest, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        style={styles.backRow}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Назад"
      >
        <Ionicons name="chevron-back" size={22} color="#0A84FF" />
        <Text style={styles.backText}>Профиль</Text>
      </TouchableOpacity>
      <View style={styles.guestBody}>
        <View style={styles.emptyIcon}>
          <Ionicons name="lock-closed-outline" size={36} color="#007AFF" />
        </View>
        <Text style={styles.emptyTitle}>Только для аккаунта</Text>
        <Text style={styles.emptyText}>
          Память ИИ доступна только авторизованным пользователям. Войдите, чтобы посмотреть и удалить факты, которые BYTE о вас хранит.
        </Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => router.push('/profile/auth')}>
          <Text style={styles.signInText}>Войти в аккаунт</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const FactsList = ({ token }: { token: string }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { confirmProfileReview } = useAuth();
  const [groups, setGroups] = useState<FactGroups>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);
  const [mode, setMode] = useState<'list' | 'game'>('list');
  const [deck, setDeck] = useState<UserFact[]>([]);
  const [gameDone, setGameDone] = useState(false);
  const [editing, setEditing] = useState<UserFact | null>(null);
  const [settling, setSettling] = useState(false);
  const deckRef = React.useRef<UserFact[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setGroups(await fetchFactGroups(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить память ИИ');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const liveSources = useMemo(() => orderedSources(groups), [groups]);
  const [heldSources, setHeldSources] = useState<string[]>([]);
  const sources = useMemo(() => {
    const visible = new Set([...heldSources, ...liveSources]);
    const known = SOURCE_ORDER.filter(source => visible.has(source));
    const extra = [...visible].filter(
      source => !SOURCE_ORDER.includes(source as (typeof SOURCE_ORDER)[number]),
    );
    return [...known, ...extra];
  }, [heldSources, liveSources]);
  const total = countFacts(groups);

  useEffect(() => {
    setHeldSources(current => Array.from(new Set([...current, ...liveSources])));
    const timer = setTimeout(() => setHeldSources(liveSources), 280);
    return () => clearTimeout(timer);
  }, [liveSources]);

  const handleDeleteOne = (fact: UserFact) => {
    setGroups(current => withoutFact(current, fact.id));
    deleteFact(token, fact.id).catch(err => {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось удалить факт');
      load();
    });
  };

  const wipe = async () => {
    setWiping(true);
    try {
      await deleteAllFacts(token);
      setGroups({});
    } catch (err) {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось очистить память ИИ');
    } finally {
      setWiping(false);
    }
  };

  const replaceDeck = (next: UserFact[]) => {
    deckRef.current = next;
    setDeck(next);
  };

  const finishReview = async () => {
    setGameDone(true);
    try {
      await confirmProfileReview();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить отметку. Попробуйте ещё раз.');
    }
  };

  const openGame = () => {
    replaceDeck(flattenFacts(groups));
    setGameDone(false);
    setEditing(null);
    setMode('game');
  };

  const handleSwipe = (fact: UserFact, direction: SwipeDirection) => {
    const next = deckRef.current.filter(item => item.id !== fact.id);
    replaceDeck(next);
    if (direction === 'up') {
      setEditing(fact);
      return;
    }
    if (direction === 'right') {
      if (next.length === 0) void finishReview();
      return;
    }
    if (next.length === 0) setSettling(true);
    deleteFact(token, fact.id)
      .then(() => {
        setGroups(current => withoutFact(current, fact.id));
        setSettling(false);
        if (deckRef.current.length === 0) void finishReview();
      })
      .catch(err => {
        setSettling(false);
        Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось удалить факт');
        replaceDeck([fact, ...deckRef.current.filter(item => item.id !== fact.id)]);
      });
  };

  const handleSaveEdit = async (fact: UserFact, text: string) => {
    if (text !== fact.fact_text) {
      const updated = await updateFact(token, fact.id, text);
      setGroups(current => withUpdatedFact(current, updated.id, updated.fact_text));
    }
    setEditing(null);
    if (deckRef.current.length === 0) await finishReview();
  };

  const handleCancelEdit = (fact: UserFact) => {
    setEditing(null);
    if (deckRef.current.some(item => item.id === fact.id)) return;
    replaceDeck([fact, ...deckRef.current]);
  };

  const confirmWipe = () => {
    Alert.alert(
      'Забыть всё',
      'BYTE удалит все сохранённые факты о вас. Восстановить их будет нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Забыть всё', style: 'destructive', onPress: () => { void wipe(); } },
      ],
    );
  };

  const header = (
    <>
      <TouchableOpacity
        style={styles.backRow}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Назад"
      >
        <Ionicons name="chevron-back" size={22} color="#0A84FF" />
        <Text style={styles.backText}>Профиль</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Память ИИ</Text>
      <Text style={styles.subtitle}>Что BYTE знает о вас. Любой факт можно стереть.</Text>

      <View style={styles.modeSwitch}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'list' && styles.modeButtonOn]}
          onPress={() => setMode('list')}
          accessibilityRole="button"
        >
          <Text style={[styles.modeText, mode === 'list' && styles.modeTextOn]}>Обычный список</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'game' && styles.modeButtonOn]}
          onPress={() => {
            if (mode !== 'game' && !loading) openGame();
          }}
          accessibilityRole="button"
        >
          <Text style={[styles.modeText, mode === 'game' && styles.modeTextOn]}>Игровой режим 🎮</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (mode === 'game') {
    return (
      <View style={[styles.flex, styles.content, { paddingTop: insets.top + 8, paddingBottom: tabBarHeight }]}>
        {header}
        <FactSwipeDeck
          deck={deck}
          done={gameDone}
          settling={settling}
          editing={editing}
          onSwipe={handleSwipe}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
        />
      </View>
    );
  }

  return (
    <Animated.ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: tabBarHeight + 28 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {header}

      {total > 0 && (
        <TouchableOpacity
          style={[styles.forgetButton, wiping && styles.forgetButtonDisabled]}
          onPress={confirmWipe}
          disabled={wiping}
          accessibilityRole="button"
          accessibilityLabel="Забыть всё"
        >
          {wiping ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#fff" />
          )}
          <Text style={styles.forgetText}>Забыть всё</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.centeredBlock}>
          <ActivityIndicator color="#007AFF" />
        </View>
      ) : error ? (
        <View style={styles.centeredBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : sources.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="sparkles-outline" size={36} color="#64D2FF" />
          </View>
          <Text style={styles.emptyTitle}>Память чиста</Text>
          <Text style={styles.emptyText}>BYTE пока ничего о тебе не знает. Память чиста!</Text>
        </View>
      ) : (
        sources.map(source => {
          const meta = sourceMeta(source);
          const items = groups[source] ?? [];
          return (
            <View key={source} style={styles.section}>
              {items.length > 0 && (
                <View style={styles.sectionHead}>
                  <Ionicons name={meta.icon} size={16} color="#8e8e93" />
                  <Text style={styles.sectionTitle}>{meta.title}</Text>
                  <Text style={styles.sectionCount}>{items.length}</Text>
                </View>
              )}
              <View style={styles.card} collapsable={false}>
                {items.map((fact, index) => (
                  <Animated.View
                    key={fact.id}
                    layout={LinearTransition.duration(280)}
                    exiting={FadeOut.duration(240)}
                    style={[styles.factRow, index === items.length - 1 && styles.factRowLast]}
                  >
                    <Text style={styles.factText}>{fact.fact_text}</Text>
                    <TouchableOpacity
                      style={styles.factDelete}
                      onPress={() => handleDeleteOne(fact)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Удалить факт"
                    >
                      <Ionicons name="close" size={18} color="#FF453A" />
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </View>
            </View>
          );
        })
      )}
    </Animated.ScrollView>
  );
};

export default FactsScreen;

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centeredBlock: { paddingTop: 48, alignItems: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { color: '#0A84FF', fontSize: 17, marginLeft: 2 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 12 },
  subtitle: { color: '#8e8e93', fontSize: 15, lineHeight: 21, marginTop: 6, marginBottom: 14 },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  modeButton: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  modeButtonOn: { backgroundColor: '#2C2D2E' },
  modeText: { color: '#8e8e93', fontSize: 13, fontWeight: '600' },
  modeTextOn: { color: '#fff' },
  forgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF453A',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 22,
  },
  forgetButtonDisabled: { opacity: 0.6 },
  forgetText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  section: { marginBottom: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: {
    flex: 1,
    color: '#8e8e93',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionCount: { color: '#636366', fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: '#1C1C1E', borderRadius: 14, overflow: 'hidden' },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2D2E',
  },
  factRowLast: { borderBottomWidth: 0 },
  factText: { flex: 1, color: '#F2F2F7', fontSize: 16, lineHeight: 22 },
  factDelete: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
  },
  emptyWrap: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 12 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(100, 210, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#8e8e93', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  errorText: { color: '#FF8A84', fontSize: 15, textAlign: 'center', marginBottom: 14 },
  retryButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  retryText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },
  guest: { flex: 1, paddingHorizontal: 16 },
  guestBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 48 },
  signInButton: {
    marginTop: 22,
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
