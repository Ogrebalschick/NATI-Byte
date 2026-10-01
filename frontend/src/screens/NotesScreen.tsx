import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNote, deleteNote, fetchNotes, joinCategory, updateNote } from '../api/notesApi';
import { useAuth } from '../context/AuthContext';
import { isSessionExpired } from '../api/http';
import { ScreenWrapper } from '../components/ScreenWrapper';
import {
  loadCategoryCatalog,
  loadGuestNotes,
  saveCategoryCatalog,
  saveGuestNotes,
} from '../storage/notesStorage';

type ScreenView = 'list' | 'edit';
type SheetMode = 'assign' | 'create';

type Note = {
  id: string;
  title: string;
  body: string;
  categories: string[];
  createdAt: string;
};

type Draft = Note & { isNew: boolean };

type Selection = { start: number; end: number };

type CategoryTone = { bg: string; fg: string; solid: string };

const ALL_FILTER = 'Все';
const INITIAL_CATEGORIES = ['Физика', 'Сессия', 'Разное', 'Лабы'];

const TONE_PALETTE: CategoryTone[] = [
  { bg: 'rgba(10,132,255,0.18)', fg: '#64B5FF', solid: '#0A84FF' },
  { bg: 'rgba(191,90,242,0.20)', fg: '#D7A4FF', solid: '#BF5AF2' },
  { bg: 'rgba(142,142,147,0.20)', fg: '#C7C7CC', solid: '#636366' },
  { bg: 'rgba(48,209,88,0.18)', fg: '#6EE79A', solid: '#248A3D' },
  { bg: 'rgba(255,159,10,0.18)', fg: '#FFB340', solid: '#C93400' },
  { bg: 'rgba(255,69,58,0.18)', fg: '#FF8A84', solid: '#FF453A' },
  { bg: 'rgba(100,210,255,0.18)', fg: '#64D2FF', solid: '#0071A4' },
  { bg: 'rgba(255,55,95,0.18)', fg: '#FF6482', solid: '#FF375F' },
];

const BUILTIN_TONE: Record<string, CategoryTone> = {
  Физика: TONE_PALETTE[0],
  Сессия: TONE_PALETTE[1],
  Разное: TONE_PALETTE[2],
  Лабы: TONE_PALETTE[3],
};

function collectCategories(base: string[], groups: string[][]): string[] {
  const next = [...base];
  for (const name of groups.flat()) {
    const trimmed = name.trim();
    if (trimmed && !next.includes(trimmed)) next.push(trimmed);
  }
  return next;
}

function isServerNoteId(id: string): boolean {
  return /^\d+$/.test(id);
}

function categoryTone(name: string, index: number): CategoryTone {
  return BUILTIN_TONE[name] ?? TONE_PALETTE[Math.abs(index) % TONE_PALETTE.length];
}

function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date
    .toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric',
    })
    .replace(/\s*г\.?$/i, '');
}

function notesCountLabel(count: number): string {
  const n10 = count % 10;
  const n100 = count % 100;
  if (n10 === 1 && n100 !== 11) return `${count} заметка`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${count} заметки`;
  return `${count} заметок`;
}

function withCategory(categories: string[], name: string): string[] {
  return categories.includes(name) ? categories : [...categories, name];
}

function applyWrap(
  value: string,
  selection: Selection,
  before: string,
  after: string,
  placeholder: string,
): { value: string; selection: Selection } {
  const start = Math.max(0, Math.min(selection.start, selection.end));
  const end = Math.max(start, Math.max(selection.start, selection.end));
  const selected = value.slice(start, end);
  const inner = selected.length > 0 ? selected : placeholder;
  const next = `${value.slice(0, start)}${before}${inner}${after}${value.slice(end)}`;
  if (selected.length > 0) {
    const cursor = start + before.length + inner.length + after.length;
    return { value: next, selection: { start: cursor, end: cursor } };
  }
  const innerStart = start + before.length;
  return { value: next, selection: { start: innerStart, end: innerStart + placeholder.length } };
}

function applyLinePrefix(
  value: string,
  selection: Selection,
  prefix: string,
): { value: string; selection: Selection } {
  const start = Math.max(0, Math.min(selection.start, selection.end));
  const end = Math.max(start, Math.max(selection.start, selection.end));
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', start);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  if (value.slice(lineStart, lineEnd).startsWith(prefix)) {
    return { value, selection: { start, end } };
  }
  const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
  return {
    value: next,
    selection: { start: start + prefix.length, end: end + prefix.length },
  };
}

const NotesScreen = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { isAuthenticated, token } = useAuth();
  const bodyRef = useRef<TextInput>(null);
  const selectionRef = useRef<Selection>({ start: 0, end: 0 });
  const hydrated = useRef(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ScreenView>('list');
  const [filter, setFilter] = useState(ALL_FILTER);
  const [query, setQuery] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    hydrated.current = false;
    setLoaded(false);

    (async () => {
      try {
        const catalog = await loadCategoryCatalog();
        if (isAuthenticated && token) {
          let guest = await loadGuestNotes();
          while (guest.length > 0) {
            const note = guest[0];
            await createNote(token, {
              title: note.title,
              content: note.body,
              category: joinCategory(note.categories),
              ai_classify: false,
              created_at: note.createdAt,
            });
            guest = guest.slice(1);
            await saveGuestNotes(guest);
          }
          const remote = await fetchNotes(token);
          if (cancelled) return;
          setNotes(remote);
          setCategories(collectCategories(INITIAL_CATEGORIES, [catalog, ...remote.map(note => note.categories)]));
        } else {
          const local = await loadGuestNotes();
          if (cancelled) return;
          setNotes(local);
          setCategories(collectCategories(INITIAL_CATEGORIES, [catalog, ...local.map(note => note.categories)]));
        }
      } catch (err: any) {
        if (cancelled || isSessionExpired(err)) return;
        Alert.alert('Заметки', err?.message || 'Не удалось загрузить заметки');
      } finally {
        if (!cancelled) {
          hydrated.current = true;
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (!hydrated.current) return;
    saveCategoryCatalog(categories).catch(() => undefined);
  }, [categories]);

  const selecting = selectedIds.length > 0;
  const needle = query.trim().toLowerCase();
  const visibleNotes = notes.filter(note => {
    const inCategory = filter === ALL_FILTER || note.categories.includes(filter);
    if (!inCategory) return false;
    if (!needle) return true;
    return note.title.toLowerCase().includes(needle) || note.body.toLowerCase().includes(needle);
  });

  const rememberSelection = (next: Selection) => {
    selectionRef.current = next;
    setSelection(prev => (prev.start === next.start && prev.end === next.end ? prev : next));
  };

  const openNote = (note: Note) => {
    const cursor = note.body.length;
    rememberSelection({ start: cursor, end: cursor });
    setDraft({ ...note, categories: [...note.categories], isNew: false });
    setPreview(false);
    setView('edit');
  };

  const openNewNote = () => {
    rememberSelection({ start: 0, end: 0 });
    setDraft({
      id: `note-${Date.now()}`,
      title: '',
      body: '',
      categories: filter === ALL_FILTER ? [] : [filter],
      createdAt: new Date().toISOString(),
      isNew: true,
    });
    setPreview(false);
    setView('edit');
  };

  const closeEditor = () => {
    if (saving) return;
    if (!draft) {
      setView('list');
      return;
    }
    const title = draft.title.trim();
    const body = draft.body;
    if (draft.isNew && !title && !body.trim()) {
      setDraft(null);
      setPreview(false);
      setView('list');
      return;
    }

    const finish = (saved: Note, nextNotes: Note[]) => {
      setCategories(prev => collectCategories(prev, [saved.categories]));
      setNotes(nextNotes);
      setDraft(null);
      setPreview(false);
      setView('list');
    };

    const localNote = (): Note => ({
      id: draft.isNew ? `local-${Date.now()}` : draft.id,
      title: title || 'Без названия',
      body,
      categories: draft.categories.length > 0 ? [...draft.categories] : ['Разное'],
      createdAt: draft.createdAt,
    });

    if (!isAuthenticated || !token) {
      const saved = localNote();
      const nextNotes = draft.isNew
        ? [saved, ...notes]
        : notes.map(note => (note.id === saved.id ? saved : note));
      saveGuestNotes(nextNotes).catch(() => undefined);
      finish(saved, nextNotes);
      return;
    }

    setSaving(true);
    const payload = {
      title: title || 'Без названия',
      content: body,
      category: joinCategory(draft.categories),
      ai_classify: aiEnabled,
      created_at: draft.createdAt,
    };
    const request =
      draft.isNew || !isServerNoteId(draft.id)
        ? createNote(token, payload)
        : updateNote(token, Number(draft.id), payload);

    request
      .then(saved => {
        const withoutDraft = notes.filter(note => note.id !== draft.id);
        const nextNotes = [saved, ...withoutDraft.filter(note => note.id !== saved.id)];
        finish(saved, nextNotes);
      })
      .catch((err: any) => {
        Alert.alert('Заметки', err?.message || 'Не удалось сохранить заметку');
      })
      .finally(() => setSaving(false));
  };

  const toggleDraftCategory = (name: string) => {
    setDraft(current => {
      if (!current) return current;
      const has = current.categories.includes(name);
      return {
        ...current,
        categories: has
          ? current.categories.filter(item => item !== name)
          : [...current.categories, name],
      };
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const handleCardPress = (note: Note) => {
    if (selecting) {
      toggleSelected(note.id);
      return;
    }
    openNote(note);
  };

  const handleCardLongPress = (note: Note) => {
    setSelectedIds(prev => (prev.includes(note.id) ? prev : [...prev, note.id]));
  };

  const confirmDelete = () => {
    const count = selectedIds.length;
    Alert.alert('Удалить заметки?', `Будет удалено: ${notesCountLabel(count)}.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          const ids = [...selectedIds];
          const nextNotes = notes.filter(note => !ids.includes(note.id));
          const dropLocal = () => {
            setNotes(nextNotes);
            setSelectedIds([]);
            if (!isAuthenticated) saveGuestNotes(nextNotes).catch(() => undefined);
          };
          if (!isAuthenticated || !token) {
            dropLocal();
            return;
          }
          Promise.all(ids.filter(isServerNoteId).map(id => deleteNote(token, Number(id))))
            .then(dropLocal)
            .catch((err: any) => {
              Alert.alert('Заметки', err?.message || 'Не удалось удалить заметки');
            });
        },
      },
    ]);
  };

  const writeNoteCategories = async (nextNotes: Note[], changedIds: string[]) => {
    if (!isAuthenticated || !token) {
      setNotes(nextNotes);
      await saveGuestNotes(nextNotes);
      return;
    }
    const changed = nextNotes.filter(note => changedIds.includes(note.id) && isServerNoteId(note.id));
    const saved = await Promise.all(
      changed.map(note =>
        updateNote(token, Number(note.id), {
          title: note.title,
          content: note.body,
          category: joinCategory(note.categories),
          ai_classify: false,
        }),
      ),
    );
    const byId = new Map(saved.map(note => [note.id, note]));
    setNotes(nextNotes.map(note => byId.get(note.id) ?? note));
    setCategories(prev => collectCategories(prev, [saved.flatMap(note => note.categories)]));
  };

  const assignCategories = (names: string[]) => {
    const ids = [...selectedIds];
    const nextNotes = notes.map(note => {
      if (!ids.includes(note.id)) return note;
      return { ...note, categories: names.reduce(withCategory, note.categories) };
    });
    writeNoteCategories(nextNotes, ids)
      .then(() => {
        setSelectedIds([]);
        setSheet(null);
      })
      .catch((err: any) => {
        Alert.alert('Заметки', err?.message || 'Не удалось обновить категории');
      });
  };

  const createCategory = (name: string, noteIds: string[]) => {
    setCategories(prev => (prev.includes(name) ? prev : [...prev, name]));
    const nextNotes = notes.map(note =>
      noteIds.includes(note.id) ? { ...note, categories: withCategory(note.categories, name) } : note,
    );
    const done = () => {
      setFilter(name);
      setSelectedIds([]);
      setSheet(null);
    };
    if (noteIds.length === 0) {
      done();
      return;
    }
    writeNoteCategories(nextNotes, noteIds)
      .then(done)
      .catch((err: any) => {
        Alert.alert('Заметки', err?.message || 'Не удалось добавить категорию');
      });
  };

  const createCategoryFromEditor = (name: string, noteIds: string[]) => {
    if (draft && noteIds.includes(draft.id)) {
      setDraft(current =>
        current && !current.categories.includes(name)
          ? { ...current, categories: [...current.categories, name] }
          : current,
      );
    }
    const savedIds = noteIds.filter(id => notes.some(note => note.id === id));
    createCategory(name, savedIds);
  };

  const applyMarkup = (
    mutate: (value: string, current: Selection) => { value: string; selection: Selection },
  ) => {
    if (!draft) return;
    const result = mutate(draft.body, selectionRef.current);
    rememberSelection(result.selection);
    setDraft({ ...draft, body: result.value });
  };

  const togglePreview = () => {
    setPreview(current => {
      if (!current) Keyboard.dismiss();
      return !current;
    });
  };

  if (view === 'edit' && draft) {
    return (
      <ScreenWrapper>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
        >
          <View style={[styles.editHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={closeEditor}
              accessibilityRole="button"
              accessibilityLabel="Закрыть редактор"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#0A84FF" />
              ) : (
                <Ionicons name="chevron-back" size={22} color="#0A84FF" />
              )}
              <Text style={styles.backText}>{saving ? 'Сохранение…' : 'Заметки'}</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.titleInput}
            value={draft.title}
            onChangeText={title => setDraft(current => (current ? { ...current, title } : current))}
            placeholder="Заголовок"
            placeholderTextColor="#636366"
            selectionColor="#0A84FF"
            cursorColor="#0A84FF"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => bodyRef.current?.focus()}
          />

          <Text style={styles.editChipsLabel}>Категории</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.editChips}
            contentContainerStyle={styles.editChipsContent}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              style={styles.addChip}
              onPress={() => {
                Keyboard.dismiss();
                setSheet('create');
              }}
              accessibilityRole="button"
              accessibilityLabel="Новая категория"
            >
              <Ionicons name="add" size={20} color="#0A84FF" />
            </TouchableOpacity>
            {categories.map((name, index) => {
              const active = draft.categories.includes(name);
              const tone = categoryTone(name, index);
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.editorChip, active && { backgroundColor: tone.solid }]}
                  onPress={() => toggleDraftCategory(name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.editDivider} />

          {preview ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.previewContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.previewKicker}>Превью</Text>
              <View style={styles.previewCard}>
                {draft.body.trim().length > 0 ? (
                  <Markdown style={noteMarkdownStyles}>{draft.body}</Markdown>
                ) : (
                  <Text style={styles.previewBody}>Здесь появится отрендеренный Markdown</Text>
                )}
              </View>
            </ScrollView>
          ) : (
            <TextInput
              ref={bodyRef}
              style={styles.bodyInput}
              value={draft.body}
              onChangeText={body => setDraft(current => (current ? { ...current, body } : current))}
              placeholder="Начните писать заметку…"
              placeholderTextColor="#636366"
              selectionColor="#0A84FF"
              cursorColor="#0A84FF"
              multiline
              textAlignVertical="top"
              selection={selection}
              onSelectionChange={event => rememberSelection(event.nativeEvent.selection)}
            />
          )}

          <View style={styles.toolbar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={styles.toolbarContent}
            >
              <ToolButton
                label="B"
                bold
                accessibilityLabel="Жирный"
                onPress={() => applyMarkup((value, current) => applyWrap(value, current, '**', '**', 'текст'))}
              />
              <ToolButton
                label="I"
                italic
                accessibilityLabel="Курсив"
                onPress={() => applyMarkup((value, current) => applyWrap(value, current, '*', '*', 'текст'))}
              />
              <ToolButton
                label="H1"
                accessibilityLabel="Заголовок первого уровня"
                onPress={() => applyMarkup((value, current) => applyLinePrefix(value, current, '# '))}
              />
              <ToolButton
                label="H2"
                accessibilityLabel="Заголовок второго уровня"
                onPress={() => applyMarkup((value, current) => applyLinePrefix(value, current, '## '))}
              />
              <ToolButton
                icon="list"
                accessibilityLabel="Список"
                onPress={() => applyMarkup((value, current) => applyLinePrefix(value, current, '- '))}
              />
              <ToolButton
                icon="code-slash"
                accessibilityLabel="Блок кода"
                onPress={() =>
                  applyMarkup((value, current) => applyWrap(value, current, '```\n', '\n```', 'код'))
                }
              />
              <ToolButton
                icon="link"
                accessibilityLabel="Ссылка"
                onPress={() =>
                  applyMarkup((value, current) => applyWrap(value, current, '[', '](https://)', 'текст'))
                }
              />
              <ToolButton
                icon={preview ? 'eye-off' : 'eye'}
                active={preview}
                accessibilityLabel={preview ? 'Скрыть превью' : 'Показать превью Markdown'}
                onPress={togglePreview}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
        <CategorySheet
          mode={sheet}
          notes={
            notes.some(note => note.id === draft.id)
              ? notes
              : [{ ...draft, title: draft.title.trim() || 'Эта заметка' }, ...notes]
          }
          categories={categories}
          presetNoteId={draft.id}
          creatingHint="Категория сразу отметится в этой заметке. Можно добавить и другие."
          onClose={() => setSheet(null)}
          onCreate={createCategoryFromEditor}
          onAssign={assignCategories}
        />
      </ScreenWrapper>
    );
  }

  const emptyCopy = needle
    ? { title: 'Ничего не нашлось', text: 'Нет заметок с таким заголовком или текстом' }
    : { title: 'В этой категории пусто', text: 'Создайте заметку кнопкой «+» внизу экрана' };

  return (
    <ScreenWrapper>
      <View style={styles.flex}>
        <ScrollView
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: insets.top + 12, paddingBottom: selecting ? 24 : 108 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Заметки</Text>

          <View style={styles.aiRow}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={16} color="#0A84FF" />
            </View>
            <Text style={styles.aiLabel}>Авто-категоризация ИИ</Text>
            <Switch
              value={aiEnabled}
              onValueChange={setAiEnabled}
              trackColor={{ false: '#3A3A3C', true: '#0A84FF' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#3A3A3C"
            />
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#8E8E93" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск по заголовку и тексту"
              placeholderTextColor="#636366"
              selectionColor="#0A84FF"
              cursorColor="#0A84FF"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 ? (
              <TouchableOpacity
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Очистить поиск"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#8E8E93" />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            <TouchableOpacity
              style={styles.addChip}
              onPress={() => {
                Keyboard.dismiss();
                setSheet('create');
              }}
              accessibilityRole="button"
              accessibilityLabel="Новая категория"
            >
              <Ionicons name="add" size={20} color="#0A84FF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, filter === ALL_FILTER && styles.chipActive]}
              onPress={() => setFilter(ALL_FILTER)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === ALL_FILTER }}
            >
              <Text style={[styles.chipText, filter === ALL_FILTER && styles.chipTextActive]}>{ALL_FILTER}</Text>
            </TouchableOpacity>
            {categories.map((name, index) => {
              const active = name === filter;
              const tone = categoryTone(name, index);
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.chip, active && { backgroundColor: tone.solid }]}
                  onPress={() => setFilter(name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {loaded && visibleNotes.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name={needle ? 'search' : 'document-text-outline'} size={28} color="#0A84FF" />
              <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
              <Text style={styles.emptyText}>{emptyCopy.text}</Text>
            </View>
          ) : (
            visibleNotes.map(note => {
              const picked = selectedIds.includes(note.id);
              return (
                <TouchableOpacity
                  key={note.id}
                  style={[styles.card, picked && styles.cardPicked]}
                  activeOpacity={0.75}
                  delayLongPress={350}
                  onPress={() => handleCardPress(note)}
                  onLongPress={() => handleCardLongPress(note)}
                >
                  <View style={styles.cardTop}>
                    {selecting ? (
                      <View style={[styles.check, picked && styles.checkOn]}>
                        {picked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                      </View>
                    ) : null}
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {note.title || 'Без названия'}
                    </Text>
                  </View>
                  {note.categories.length > 0 ? (
                    <View style={styles.badgeRow}>
                      {note.categories.map(name => {
                        const tone = categoryTone(name, categories.indexOf(name));
                        return (
                          <View key={name} style={[styles.badge, { backgroundColor: tone.bg }]}>
                            <Text style={[styles.badgeText, { color: tone.fg }]}>{name}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  <Text style={styles.cardPreview} numberOfLines={2}>
                    {note.body.trim() || 'Пустая заметка'}
                  </Text>
                  <Text style={styles.cardDate}>{formatNoteDate(note.createdAt)}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        {selecting ? (
          <View style={styles.selectionBar}>
            <View style={styles.selectionTop}>
              <Text style={styles.selectionCount}>{notesCountLabel(selectedIds.length)}</Text>
              <TouchableOpacity
                onPress={() => setSelectedIds([])}
                accessibilityRole="button"
                accessibilityLabel="Снять выделение"
              >
                <Text style={styles.selectionCancel}>Отмена</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.selectionActions}>
              <TouchableOpacity style={styles.dangerBtn} onPress={confirmDelete} accessibilityRole="button">
                <Ionicons name="trash-outline" size={18} color="#FF453A" />
                <Text style={styles.dangerBtnText}>Удалить</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  setSheet('assign');
                }}
                accessibilityRole="button"
              >
                <Ionicons name="pricetag-outline" size={18} color="#fff" />
                <Text style={styles.assignBtnText}>В категорию</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.fab}
            onPress={openNewNote}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Новая заметка"
          >
            <Ionicons name="add" size={30} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <CategorySheet
        mode={sheet}
        notes={notes}
        categories={categories}
        onClose={() => setSheet(null)}
        onCreate={createCategory}
        onAssign={assignCategories}
      />
    </ScreenWrapper>
  );
};

type ToolButtonProps = {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  bold?: boolean;
  italic?: boolean;
  active?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
};

function ToolButton({ label, icon, bold, italic, active, accessibilityLabel, onPress }: ToolButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.toolBtn, active && styles.toolBtnActive]}
      onPressIn={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
    >
      {icon ? (
        <Ionicons name={icon} size={18} color={active ? '#0A84FF' : '#F2F2F7'} />
      ) : (
        <Text
          style={[
            styles.toolLabel,
            bold && styles.toolBold,
            italic && styles.toolItalic,
            active && styles.toolLabelActive,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

type CategorySheetProps = {
  mode: SheetMode | null;
  notes: Note[];
  categories: string[];
  presetNoteId?: string;
  creatingHint?: string;
  onClose: () => void;
  onCreate: (name: string, noteIds: string[]) => void;
  onAssign: (names: string[]) => void;
};

function CategorySheet({
  mode,
  notes,
  categories,
  presetNoteId,
  creatingHint,
  onClose,
  onCreate,
  onAssign,
}: CategorySheetProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [pickedNotes, setPickedNotes] = useState<string[]>([]);
  const [pickedCategories, setPickedCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setName('');
    setPickedNotes(presetNoteId ? [presetNoteId] : []);
    setPickedCategories([]);
    setError(null);
  }, [mode, presetNoteId]);

  const toggleNote = (id: string) => {
    setPickedNotes(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const toggleCategory = (category: string) => {
    setPickedCategories(prev =>
      prev.includes(category) ? prev.filter(item => item !== category) : [...prev, category],
    );
  };

  const submitCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Введите название категории');
      return;
    }
    if (trimmed.includes(',')) {
      setError('Название не должно содержать запятую');
      return;
    }
    if (trimmed.toLowerCase() === ALL_FILTER.toLowerCase()) {
      setError('«Все» уже занято фильтром');
      return;
    }
    if (categories.some(item => item.toLowerCase() === trimmed.toLowerCase())) {
      setError('Такая категория уже есть');
      return;
    }
    onCreate(trimmed, pickedNotes);
  };

  const creating = mode === 'create';

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{creating ? 'Новая категория' : 'Добавить в категорию'}</Text>
          <Text style={styles.sheetHint}>
            {creating
              ? creatingHint || 'Категория появится в списке сверху. Можно сразу отметить заметки.'
              : 'Категории добавятся к уже стоящим на заметках.'}
          </Text>

          {creating ? (
            <TextInput
              style={styles.sheetInput}
              value={name}
              onChangeText={text => {
                setName(text);
                setError(null);
              }}
              placeholder="Название"
              placeholderTextColor="#636366"
              selectionColor="#0A84FF"
              cursorColor="#0A84FF"
              autoFocus
            />
          ) : null}
          {error ? <Text style={styles.sheetError}>{error}</Text> : null}

          <Text style={styles.sheetLabel}>{creating ? 'Заметки' : 'Категории'}</Text>
          <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
            {creating ? (
              notes.length === 0 ? (
                <Text style={styles.sheetEmpty}>Пока нет заметок — категория создастся пустой</Text>
              ) : (
                notes.map(note => (
                  <CheckRow
                    key={note.id}
                    title={note.title || 'Без названия'}
                    subtitle={note.categories.join(' · ') || 'Без категории'}
                    checked={pickedNotes.includes(note.id)}
                    onPress={() => toggleNote(note.id)}
                  />
                ))
              )
            ) : (
              categories.map((category, index) => (
                <CheckRow
                  key={category}
                  title={category}
                  checked={pickedCategories.includes(category)}
                  tone={categoryTone(category, index)}
                  onPress={() => toggleCategory(category)}
                />
              ))
            )}
          </ScrollView>

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.ghost} onPress={onClose}>
              <Text style={styles.ghostText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primary, !creating && pickedCategories.length === 0 && styles.primaryDisabled]}
              onPress={creating ? submitCreate : () => onAssign(pickedCategories)}
              disabled={!creating && pickedCategories.length === 0}
            >
              <Text style={styles.primaryText}>{creating ? 'Создать' : 'Добавить'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type CheckRowProps = {
  title: string;
  subtitle?: string;
  checked: boolean;
  tone?: CategoryTone;
  onPress: () => void;
};

function CheckRow({ title, subtitle, checked, tone, onPress }: CheckRowProps) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.check, checked && styles.checkOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <View style={styles.checkText}>
        <Text style={[styles.checkTitle, tone && { color: tone.fg }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.checkSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { flex: 1, marginHorizontal: -16 },
  listContent: { paddingHorizontal: 16 },
  title: { color: '#fff', fontSize: 32, fontWeight: '800' },
  aiRow: {
    marginTop: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(10,132,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiLabel: { flex: 1, color: '#F2F2F7', fontSize: 15, fontWeight: '600' },
  searchRow: {
    marginTop: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 10 },
  chipsScroll: { marginHorizontal: -16, marginTop: 16 },
  chipsContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  addChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10,132,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(142,142,147,0.16)',
  },
  chipActive: { backgroundColor: '#0A84FF' },
  chipText: { color: 'rgba(242,242,247,0.55)', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardPicked: { borderColor: '#0A84FF', backgroundColor: '#1A2433' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, color: '#F2F2F7', fontSize: 17, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  cardPreview: {
    color: '#8E8E93',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  cardDate: { color: '#636366', fontSize: 12, fontWeight: '600', marginTop: 12 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  emptyCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 4 },
  emptyText: { color: '#8E8E93', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  fab: {
    position: 'absolute',
    right: 0,
    bottom: 16,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  selectionBar: {
    marginHorizontal: -16,
    backgroundColor: '#1C1C1E',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  selectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectionCount: { color: '#F2F2F7', fontSize: 15, fontWeight: '700' },
  selectionCancel: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },
  selectionActions: { flexDirection: 'row', gap: 10 },
  dangerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,69,58,0.14)',
  },
  dangerBtnText: { color: '#FF453A', fontSize: 15, fontWeight: '700' },
  assignBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: '#0A84FF',
  },
  assignBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { color: '#0A84FF', fontSize: 17, fontWeight: '600' },
  titleInput: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    paddingVertical: 8,
  },
  editChipsLabel: { color: '#8E8E93', fontSize: 13, fontWeight: '600', marginTop: 4 },
  editChips: { marginHorizontal: -16, marginTop: 8, flexGrow: 0, flexShrink: 0 },
  editChipsContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center', flexGrow: 0 },
  editorChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(142,142,147,0.16)',
  },
  editDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2C2C2E',
    marginTop: 12,
    marginBottom: 8,
  },
  bodyInput: {
    flex: 1,
    color: '#E5E5EA',
    fontSize: 16,
    lineHeight: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  previewContent: { paddingTop: 8, paddingBottom: 20 },
  previewKicker: {
    color: '#0A84FF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  previewCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
  },
  previewBody: { color: '#8E8E93', fontSize: 16, lineHeight: 24 },
  toolbar: {
    marginHorizontal: -16,
    backgroundColor: '#1C1C1E',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2C2C2E',
  },
  toolbarContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    alignItems: 'center',
  },
  toolBtn: {
    minWidth: 40,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: { backgroundColor: 'rgba(10,132,255,0.18)' },
  toolLabel: { color: '#F2F2F7', fontSize: 15, fontWeight: '600' },
  toolBold: { fontWeight: '800' },
  toolItalic: { fontStyle: 'italic' },
  toolLabelActive: { color: '#0A84FF' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '82%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3C',
    marginBottom: 12,
  },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  sheetHint: { color: '#8E8E93', fontSize: 13, lineHeight: 18, marginTop: 6 },
  sheetInput: {
    marginTop: 14,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sheetError: { color: '#FF453A', fontSize: 13, marginTop: 8 },
  sheetLabel: { color: '#C7C7CC', fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  sheetList: { maxHeight: 280 },
  sheetEmpty: { color: '#8E8E93', fontSize: 14, lineHeight: 20 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
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
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#636366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  checkText: { flex: 1 },
  checkTitle: { color: '#F2F2F7', fontSize: 16, fontWeight: '600' },
  checkSubtitle: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
});

const noteMarkdownStyles = {
  body: {
    color: '#F2F2F7',
    fontSize: 16,
    lineHeight: 24,
  },
  text: {
    color: '#F2F2F7',
    fontSize: 16,
    lineHeight: 24,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 10,
  },
  heading1: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800' as const,
    marginTop: 2,
    marginBottom: 8,
  },
  heading2: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 2,
    marginBottom: 6,
  },
  heading3: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  strong: {
    color: '#FFFFFF',
    fontWeight: '700' as const,
  },
  em: {
    color: '#F2F2F7',
    fontStyle: 'italic' as const,
  },
  s: {
    color: '#8E8E93',
    textDecorationLine: 'line-through' as const,
  },
  link: {
    color: '#64B5FF',
    textDecorationLine: 'underline' as const,
  },
  blockquote: {
    backgroundColor: '#2C2C2E',
    borderLeftColor: '#0A84FF',
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginVertical: 8,
  },
  code_inline: {
    color: '#FFB340',
    backgroundColor: '#2C2C2E',
    borderWidth: 0,
    padding: 0,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  code_block: {
    color: '#E5E5EA',
    backgroundColor: '#121117',
    borderWidth: 0,
    borderRadius: 12,
    padding: 12,
  },
  fence: {
    color: '#E5E5EA',
    backgroundColor: '#121117',
    borderWidth: 0,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  bullet_list_icon: { color: '#F2F2F7' },
  ordered_list_icon: { color: '#F2F2F7' },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  hr: {
    backgroundColor: '#2C2C2E',
    height: 1,
    marginVertical: 12,
  },
};

export default NotesScreen;
