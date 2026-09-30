import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ScoreEntry, type TrackedSubject } from '../types/subjects';

export const GUEST_SUBJECTS_KEY = '@byte_subjects_guest';

export async function loadGuestSubjects(): Promise<TrackedSubject[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_SUBJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveGuestSubjects(subjects: TrackedSubject[]): Promise<void> {
  await AsyncStorage.setItem(GUEST_SUBJECTS_KEY, JSON.stringify(subjects));
}

export function nextLocalId(items: { id: number }[]): number {
  const max = items.reduce((acc, item) => Math.max(acc, item.id || 0), 0);
  return max + 1 || Date.now();
}

export function addGuestSubject(
  list: TrackedSubject[],
  input: { name: string; max_score: number; target_score: number },
): TrackedSubject[] {
  const created: TrackedSubject = {
    id: nextLocalId(list),
    user_id: 0,
    name: input.name,
    max_score: input.max_score,
    target_score: input.target_score,
    is_custom: true,
    current_score: 0,
    scores: [],
  };
  return [...list, created];
}

export function addGuestScore(
  list: TrackedSubject[],
  subjectId: number,
  input: { score: number; description: string | null; created_at?: string },
): TrackedSubject[] {
  return list.map(subject => {
    if (subject.id !== subjectId) return subject;
    const entry: ScoreEntry = {
      id: nextLocalId(subject.scores),
      subject_id: subject.id,
      score: input.score,
      description: input.description,
      created_at: input.created_at || new Date().toISOString(),
    };
    const scores = [entry, ...subject.scores].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return {
      ...subject,
      scores,
      current_score: scores.reduce((acc, item) => acc + item.score, 0),
    };
  });
}

export function removeGuestScore(
  list: TrackedSubject[],
  subjectId: number,
  scoreId: number,
): TrackedSubject[] {
  return list.map(subject => {
    if (subject.id !== subjectId) return subject;
    const scores = subject.scores.filter(item => item.id !== scoreId);
    return {
      ...subject,
      scores,
      current_score: scores.reduce((acc, item) => acc + item.score, 0),
    };
  });
}
