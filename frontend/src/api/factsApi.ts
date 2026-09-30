import { API_URL } from '../context/AuthContext';

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
  const response = await fetch(`${API_URL}/profile/facts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

export async function deleteFact(token: string, factId: number): Promise<void> {
  const response = await fetch(`${API_URL}/profile/facts/${factId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await readError(response, 'Не удалось удалить факт'));
}

export async function deleteAllFacts(token: string): Promise<void> {
  const response = await fetch(`${API_URL}/profile/facts/all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await readError(response, 'Не удалось очистить память ИИ'));
}
