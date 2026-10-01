import { apiFetch } from './http';
import type { ScoreEntry, TrackedSubject } from '../types/subjects';

async function readError(response: Response, fallback: string): Promise<string> {
  const err = await response.json().catch(() => ({}));
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
}

function normalizeSubject(raw: any): TrackedSubject {
  const scores: ScoreEntry[] = Array.isArray(raw?.scores)
    ? raw.scores.map((item: any) => ({
        id: Number(item.id),
        subject_id: Number(item.subject_id ?? raw.id),
        score: Number(item.score) || 0,
        description: item.description ?? null,
        created_at: item.created_at ? String(item.created_at) : new Date().toISOString(),
      }))
    : [];
  return {
    id: Number(raw.id),
    user_id: Number(raw.user_id) || 0,
    name: String(raw.name || ''),
    max_score: Number(raw.max_score) || 0,
    target_score: Number(raw.target_score) || 0,
    is_custom: raw.is_custom !== false,
    current_score:
      typeof raw.current_score === 'number'
        ? raw.current_score
        : scores.reduce((acc, item) => acc + item.score, 0),
    scores,
  };
}

export async function fetchSubjects(token: string): Promise<TrackedSubject[]> {
  const response = await apiFetch('/subjects', {}, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось загрузить предметы'));
  const data = await response.json();
  const items = Array.isArray(data) ? data : data.items || [];
  return items.map(normalizeSubject);
}

export async function createSubject(
  token: string,
  body: { name: string; max_score: number; target_score: number },
): Promise<TrackedSubject> {
  const response = await apiFetch('/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, is_custom: true }),
  }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось создать предмет'));
  return normalizeSubject(await response.json());
}

export async function addSubjectScore(
  token: string,
  subjectId: number,
  body: { score: number; description: string | null; created_at?: string },
): Promise<ScoreEntry> {
  const response = await apiFetch(`/subjects/${subjectId}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось добавить баллы'));
  const item = await response.json();
  return {
    id: Number(item.id),
    subject_id: Number(item.subject_id ?? subjectId),
    score: Number(item.score) || 0,
    description: item.description ?? null,
    created_at: item.created_at ? String(item.created_at) : new Date().toISOString(),
  };
}

export async function deleteSubjectScore(
  token: string,
  subjectId: number,
  scoreId: number,
): Promise<void> {
  const response = await apiFetch(
    `/subjects/${subjectId}/scores/${scoreId}`,
    { method: 'DELETE' },
    token,
  );
  if (!response.ok) throw new Error(await readError(response, 'Не удалось удалить запись'));
}
