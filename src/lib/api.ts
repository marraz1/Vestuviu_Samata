// Thin PostgREST client for the Neon Data API. Every request carries the user's JWT;
// row-level security in Postgres decides what each user may see and change.
import { getJwt } from './auth';

export const API_URL = import.meta.env.VITE_NEON_DATA_API_URL ?? '';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Thrown when an update matched no row because someone else saved first. */
export class ConflictError extends Error {
  constructor() {
    super('Kažkas ką tik pakeitė šį įrašą.');
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown, returnRows = true): Promise<T> {
  const token = await getJwt();
  if (!token) throw new ApiError('Sesija baigėsi. Prisijunkite iš naujo.', 401);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(method !== 'GET' && returnRows ? { Prefer: 'return=representation' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Nepavyko pasiekti serverio. Patikrinkite ryšį.', 0);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.message ?? `Klaida (${res.status})`, res.status);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  insert: <T>(table: string, row: object) => request<T[]>('POST', `/${table}`, row).then((r) => r[0]),
  update: <T>(table: string, filter: string, patch: object) => request<T[]>('PATCH', `/${table}?${filter}`, patch),
  remove: (table: string, filter: string) => request<unknown>('DELETE', `/${table}?${filter}`, undefined, false),
  rpc: <T>(fn: string, args: object = {}) => request<T>('POST', `/rpc/${fn}`, args, false),

  /**
   * Optimistic update: only succeeds if the row still has the `updated_at` we loaded.
   * Throws ConflictError otherwise ("last save wins, with a warning").
   */
  async updateChecked<T>(table: string, id: string, updatedAt: string, patch: object): Promise<T> {
    const rows = await request<T[]>(
      'PATCH',
      `/${table}?id=eq.${id}&updated_at=eq.${encodeURIComponent(updatedAt)}`,
      patch,
    );
    if (rows.length === 0) throw new ConflictError();
    return rows[0];
  },
};
