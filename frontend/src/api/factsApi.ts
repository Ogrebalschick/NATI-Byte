import { apiFetch } from './http';

export type UserFact = {
  id: number;
  user_id: number;
  fact_text: string;
  source: string;
  created_at: string;
};

export type FactGroups = Record<string, UserFact[]>;

async function readError(response: Response, fallback: string): Promise<string> {
  const err = await response.json().catch(() => ({}));
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object' && 'msg' in detail[0]) {
    return String((detail[0] as { msg?: unknown }).msg || fallback);
  }
  return fallback;
}

function normalizeFact(raw: unknown): UserFact | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    user_id: Number(row.user_id) || 0,
    fact_text: String(row.fact_text || ''),
    source: String(row.source || ''),
    created_at: row.created_at ? String(row.created_at) : '',
  };
}

export async function fetchFactGroups(token: string): Promise<FactGroups> {
  const response = await apiFetch('/profile/facts', {}, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось загрузить память ИИ'));
  const data = await response.json();
  const groups = data?.groups;
  if (!groups || typeof groups !== 'object') return {};
  const result: FactGroups = {};
  for (const [source, items] of Object.entries(groups as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue;
    result[source] = items
      .map(normalizeFact)
      .filter((item): item is UserFact => item !== null);
  }
  return result;
}

export function factTexts(groups: FactGroups): string[] {
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const items of Object.values(groups)) {
    for (const item of items) {
      const text = item.fact_text.trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      texts.push(text);
    }
  }
  return texts;
}

const STOP_WORDS = new Set([
  'я', 'мы', 'ты', 'он', 'она', 'они', 'мне', 'меня', 'мой', 'моя', 'мои', 'мое',
  'это', 'этот', 'эта', 'эти', 'есть', 'быть', 'является', 'являюсь',
  'и', 'а', 'но', 'или', 'что', 'как', 'не', 'да', 'уже', 'еще', 'тоже', 'также',
  'в', 'на', 'по', 'с', 'со', 'к', 'ко', 'из', 'от', 'для', 'о', 'об', 'у', 'за',
  'очень', 'просто', 'вообще',
  'люблю', 'любит', 'любишь', 'любят', 'нравится', 'нравятся', 'обожаю', 'обожает',
  'увлекаюсь', 'увлекается', 'занимаюсь', 'занимается', 'предпочитаю', 'предпочитает',
  'студент', 'студентка', 'пользователь',
]);

const ENDINGS = [
  'ироваться', 'ирование', 'ировать', 'ование', 'овать', 'евать', 'ивать',
  'ениями', 'остями', 'ами', 'ями', 'ого', 'ему', 'ыми', 'ими',
  'ение', 'ание', 'ость', 'ах', 'ях', 'ов', 'ев', 'ей',
  'ий', 'ый', 'ой', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие',
  'ать', 'ять', 'ить', 'еть', 'ться', 'ть', 'ся',
];

function normalizeFactText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stemWord(word: string): string {
  for (const ending of ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 4) {
      return word.slice(0, -ending.length);
    }
  }
  if (word.length > 4 && 'аеиоуыэюяьй'.includes(word.slice(-1))) {
    return word.slice(0, -1);
  }
  return word;
}

function factTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of normalizeFactText(text).match(/[a-zа-я0-9]+(?:-[a-zа-я0-9]+)*/g) ?? []) {
    if (STOP_WORDS.has(word)) continue;
    if (word.length < 3 && !/\d/.test(word)) continue;
    tokens.add(/\d/.test(word) ? word : stemWord(word));
  }
  return tokens;
}

/** True when `candidate` adds nothing beyond `stored`, including a rephrase. */
export function sameFact(candidate: string, stored: string): boolean {
  const left = normalizeFactText(candidate);
  const right = normalizeFactText(stored);
  if (!left || !right) return false;
  if (left === right) return true;
  const candidateTokens = factTokens(candidate);
  const storedTokens = factTokens(stored);
  if (candidateTokens.size === 0 || storedTokens.size === 0) return false;
  for (const token of candidateTokens) {
    if (!storedTokens.has(token)) return false;
  }
  return true;
}

export function mergeFactTexts(current: string[], incoming: string[]): string[] {
  const next = [...current];
  for (const raw of incoming) {
    const text = raw.trim();
    if (!text || next.some(stored => sameFact(text, stored))) continue;
    next.push(text);
  }
  return next;
}

export async function createChatFacts(token: string, facts: string[]): Promise<string[]> {
  const payload = facts.map(item => item.trim()).filter(Boolean);
  if (payload.length === 0) return [];
  const response = await apiFetch('/profile/facts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ facts: payload, source: 'chat' }),
  }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось сохранить факты'));
  const data = await response.json();
  const created = Array.isArray(data?.created) ? data.created : [];
  return created
    .map((row: { fact_text?: unknown }) => String(row?.fact_text || '').trim())
    .filter(Boolean);
}

export async function updateFact(token: string, factId: number, factText: string): Promise<UserFact> {
  const response = await apiFetch(`/profile/facts/${factId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fact_text: factText }),
  }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось обновить факт'));
  const row = normalizeFact(await response.json());
  if (!row) throw new Error('Не удалось обновить факт');
  return row;
}

export async function deleteFact(token: string, factId: number): Promise<void> {
  const response = await apiFetch(`/profile/facts/${factId}`, { method: 'DELETE' }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось удалить факт'));
}

export async function deleteAllFacts(token: string): Promise<void> {
  const response = await apiFetch('/profile/facts/all', { method: 'DELETE' }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось очистить память ИИ'));
}
