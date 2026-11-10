// Minimal Neon Auth (Better Auth) client.
// The session lives in a partitioned, HttpOnly cookie on the auth domain
// (credentials: 'include'); the Data API gets a short-lived JWT from /token.

export const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL ?? '';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export class AuthError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Neteisingas el. paštas arba slaptažodis.',
  USER_ALREADY_EXISTS: 'Toks naudotojas jau užregistruotas. Prisijunkite.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Toks naudotojas jau užregistruotas. Prisijunkite.',
  PASSWORD_TOO_SHORT: 'Slaptažodis per trumpas (bent 8 simboliai).',
  INVALID_EMAIL: 'Neteisingas el. pašto adresas.',
  INVALID_TOKEN: 'Nuoroda nebegalioja. Paprašykite naujos.',
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new AuthError('Nepavyko prisijungti prie serverio. Patikrinkite ryšį.', 0);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const code = data?.code as string | undefined;
    throw new AuthError((code && MESSAGES[code]) || data?.message || 'Įvyko klaida.', res.status, code);
  }
  return data as T;
}

let jwt: { token: string; exp: number } | null = null;

function decodeExp(token: string): number {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part)).exp * 1000;
  } catch {
    return 0;
  }
}

/** Returns a valid JWT for the Data API, refreshing it shortly before it expires. */
export async function getJwt(): Promise<string | null> {
  if (jwt && jwt.exp - Date.now() > 60_000) return jwt.token;
  try {
    const { token } = await call<{ token: string }>('/token');
    jwt = { token, exp: decodeExp(token) };
    return token;
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) {
      jwt = null;
      return null;
    }
    throw e;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const data = await call<{ user: SessionUser } | null>('/get-session');
  return data?.user ?? null;
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  jwt = null;
  const data = await call<{ user: SessionUser }>('/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  return data.user;
}

export async function signUp(name: string, email: string, password: string): Promise<SessionUser> {
  jwt = null;
  const data = await call<{ user: SessionUser }>('/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
  });
  return data.user;
}

export async function signOut(): Promise<void> {
  jwt = null;
  await call('/sign-out', { method: 'POST', body: '{}' });
}

/** Sends a reset link; the link returns to the site with ?token=… in the URL. */
export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  await call('/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), redirectTo }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await call('/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
}
