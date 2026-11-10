import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role } from '../domain/types';
import { getSession, signOut as doSignOut, type SessionUser } from './auth';
import { useMyWeddings, type WeddingRow } from './data';

interface SessionCtx {
  user: SessionUser | null;
  refresh: () => Promise<unknown>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children, fallback }: { children: (user: SessionUser | null) => ReactNode; fallback: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['session'], queryFn: getSession, staleTime: Infinity, retry: 1 });
  if (q.isPending) return <>{fallback}</>;
  const value: SessionCtx = {
    user: q.data ?? null,
    refresh: () => q.refetch(),
    signOut: async () => {
      await doSignOut().catch(() => {});
      qc.clear();
      await q.refetch();
    },
  };
  return <Ctx.Provider value={value}>{children(value.user)}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}

// ---------- current wedding ----------

const KEY = 'vs.currentWedding';

function readStored(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

interface WeddingCtx {
  weddingId: string;
  role: Role;
  weddings: { role: Role; wedding: WeddingRow }[];
  select: (id: string) => void;
  /** owner/partner may change planning data (budget, categories); editors only expenses/payments. */
  canPlan: boolean;
  canEdit: boolean;
}

const WCtx = createContext<WeddingCtx | null>(null);

export function WeddingProvider({ children, empty, loading }: { children: ReactNode; empty: ReactNode; loading: ReactNode }) {
  const q = useMyWeddings(true);
  const [selected, setSelected] = useState<string | null>(readStored);
  const list = q.data ?? [];
  const current = list.find((w) => w.wedding.id === selected) ?? list[0];

  useEffect(() => {
    if (current && current.wedding.id !== selected) setSelected(current.wedding.id);
  }, [current, selected]);

  if (q.isPending) return <>{loading}</>;
  if (q.isError) throw q.error;
  if (!current) return <>{empty}</>;

  const value: WeddingCtx = {
    weddingId: current.wedding.id,
    role: current.role,
    weddings: list,
    select: (id) => {
      try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
      setSelected(id);
    },
    canPlan: current.role === 'owner' || current.role === 'partner',
    canEdit: current.role !== 'viewer',
  };
  return <WCtx.Provider value={value}>{children}</WCtx.Provider>;
}

export function useWedding() {
  const c = useContext(WCtx);
  if (!c) throw new Error('useWedding outside WeddingProvider');
  return c;
}
