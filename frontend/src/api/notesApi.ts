import { apiFetch } from './http';
import type { StoredNote } from '../storage/notesStorage';

export type NoteWrite = {
  title: string;
  content: string;
  category?: string;
  ai_classify?: boolean;
  created_at?: string;
};

function splitCategory(category: string | null | undefined): string[] {
  const parts = String(category || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ['Разное'];
}

export function joinCategory(categories: string[]): string {
  const unique: string[] = [];
  for (const name of categories) {
    const trimmed = name.trim();
    if (!trimmed || unique.includes(trimmed)) continue;
    unique.push(trimmed);
  }
  return unique.join(', ') || 'Разное';
}

async function readError(response: Response, fallback: string): Promise<string> {
  const err = await response.json().catch(() => ({}));
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
}

function normalizeNote(raw: any): StoredNote {
  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title || ''),
    body: String(raw?.content || ''),
    categories: splitCategory(raw?.category),
    createdAt: raw?.created_at ? String(raw.created_at) : new Date().toISOString(),
  };
}

export async function fetchNotes(token: string): Promise<StoredNote[]> {
  const response = await apiFetch('/notes', {}, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось загрузить заметки'));
  const data = await response.json();
  const items = Array.isArray(data) ? data : data.items || [];
  return items.map(normalizeNote);
}

export async function createNote(token: string, body: NoteWrite): Promise<StoredNote> {
  const response = await apiFetch('/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось сохранить заметку'));
  return normalizeNote(await response.json());
}

export async function updateNote(token: string, noteId: number, body: NoteWrite): Promise<StoredNote> {
  const response = await apiFetch(`/notes/${noteId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось обновить заметку'));
  return normalizeNote(await response.json());
}

export async function deleteNote(token: string, noteId: number): Promise<void> {
  const response = await apiFetch(`/notes/${noteId}`, { method: 'DELETE' }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось удалить заметку'));
}
