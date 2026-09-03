export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

export const fmt = {
  pct(x: number | null | undefined) {
    if (x == null) return '—';
    return `${x > 0 ? '+' : ''}${x.toFixed(1)}%`;
  },
  lmin(x: number | null | undefined) {
    if (x == null) return '—';
    return `${x.toFixed(2)} L/min`;
  },
  date(s: string | null | undefined) {
    if (!s) return '—';
    return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  },
  day(s: string | null | undefined) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString(undefined, { dateStyle: 'medium' });
  },
};
