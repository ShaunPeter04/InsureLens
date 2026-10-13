// Render the backend's calendar date in UTC; never recalculate a waiting end.
export function formatWaitingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)) return 'Not available';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', { timeZone:'UTC' }).format(date);
}
