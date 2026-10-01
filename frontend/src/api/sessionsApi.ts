import { apiFetch } from './http';

export type DeviceSession = {
  id: string;
  device_name: string;
  ip_address: string | null;
  last_active: string;
  is_current: boolean;
};

async function readError(response: Response, fallback: string): Promise<string> {
  const err = await response.json().catch(() => ({}));
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === 'object' && 'msg' in detail[0]) {
    return String((detail[0] as { msg?: unknown }).msg || fallback);
  }
  return fallback;
}

function normalizeSession(raw: unknown): DeviceSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || '').trim();
  if (!id) return null;
  return {
    id,
    device_name: String(row.device_name || 'Неизвестное устройство'),
    ip_address: row.ip_address ? String(row.ip_address) : null,
    last_active: row.last_active ? String(row.last_active) : '',
    is_current: row.is_current === true,
  };
}

export async function fetchSessions(token: string): Promise<DeviceSession[]> {
  const response = await apiFetch('/auth/sessions', {}, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось загрузить сессии'));
  const data = await response.json();
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map(normalizeSession)
    .filter((item): item is DeviceSession => item !== null);
}

export async function revokeSession(token: string, sessionId: string): Promise<void> {
  const response = await apiFetch(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось завершить сессию'));
}

export async function revokeOtherSessions(token: string): Promise<number> {
  const response = await apiFetch('/auth/sessions/other', { method: 'DELETE' }, token);
  if (!response.ok) throw new Error(await readError(response, 'Не удалось завершить другие сессии'));
  const data = await response.json().catch(() => ({}));
  const revoked = Number((data as { revoked?: unknown }).revoked);
  return Number.isFinite(revoked) ? revoked : 0;
}
