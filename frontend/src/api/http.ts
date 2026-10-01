import { getApiUrl } from './config';

export class SessionExpiredError extends Error {
  constructor() {
    super('Сессия завершена');
    this.name = 'SessionExpiredError';
  }
}

type SessionHandler = () => void | Promise<void>;

let sessionHandler: SessionHandler | null = null;
let signedIn = false;
let sessionLock = false;

export function isSessionExpired(error: unknown): boolean {
  return error instanceof SessionExpiredError;
}

/** AuthProvider registers logout + redirect here. */
export function setSessionExpiredHandler(handler: SessionHandler | null) {
  sessionHandler = handler;
}

/**
 * True while a bearer token is stored. A 401 after logout is ignored,
 * so an in-flight request cannot send the user to the auth screen twice.
 */
export function setAuthSessionActive(active: boolean) {
  signedIn = active;
  if (active) sessionLock = false;
}

function notifySessionExpired(): Promise<void> {
  if (!signedIn || sessionLock || !sessionHandler) return Promise.resolve();
  sessionLock = true;
  signedIn = false;
  const handler = sessionHandler;
  return Promise.resolve(handler()).catch(() => {
    sessionLock = false;
  });
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${getApiUrl()}${path}`, { ...init, headers });
  if (response.status === 401 && token) {
    await notifySessionExpired();
    throw new SessionExpiredError();
  }
  return response;
}
