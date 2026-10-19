/** Small display helpers shared by catalog-style screens. */

export function formatPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined) return '';
  const n = Number(price);
  if (Number.isNaN(n)) return '';
  // Laravel decimal:2 arrives as a string like "499.00".
  return `Rs ${n.toFixed(2)}`;
}

export function formatDuration(
  timed: boolean,
  durationMinutes: number | null | undefined,
): string {
  if (!timed || !durationMinutes) return 'Untimed';
  return `${durationMinutes} mins`;
}

/** mm:ss countdown display. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** Compact elapsed-time display: "45s", "12m 34s", "1h 5m". */
export function formatElapsed(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}
