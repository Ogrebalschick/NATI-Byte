import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_NOTES_KEY = '@byte_notes_guest';
export const NOTE_CATEGORIES_KEY = '@byte_note_categories';

export type StoredNote = {
  id: string;
  title: string;
  body: string;
  categories: string[];
  createdAt: string;
};

function isStoredNote(value: unknown): value is StoredNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as StoredNote;
  return (
    typeof note.id === 'string' &&
    typeof note.title === 'string' &&
    typeof note.body === 'string' &&
    Array.isArray(note.categories) &&
    typeof note.createdAt === 'string'
  );
}

export async function loadGuestNotes(): Promise<StoredNote[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredNote);
  } catch {
    return [];
  }
}

export async function saveGuestNotes(notes: StoredNote[]): Promise<void> {
  await AsyncStorage.setItem(GUEST_NOTES_KEY, JSON.stringify(notes));
}

export async function loadCategoryCatalog(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTE_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export async function saveCategoryCatalog(names: string[]): Promise<void> {
  await AsyncStorage.setItem(NOTE_CATEGORIES_KEY, JSON.stringify(names));
}
