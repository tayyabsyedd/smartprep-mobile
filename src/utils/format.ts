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
