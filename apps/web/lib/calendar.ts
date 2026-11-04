// Small date helpers (local dates, no extra dependency). Business timezone handling comes with the backend.
export const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a: Date, b: Date): boolean => toISO(a) === toISO(b);
export const startOfWeek = (d: Date, weekStartsOn: number): Date =>
  addDays(d, -((d.getDay() - weekStartsOn + 7) % 7));
export const weekDays = (d: Date, weekStartsOn: number): Date[] => {
  const s = startOfWeek(d, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
};
export const monthGrid = (d: Date, weekStartsOn: number): Date[] => {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = startOfWeek(first, weekStartsOn);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil(((first.getDay() - weekStartsOn + 7) % 7 + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
};
export const intlLocale = (locale: string): string => (locale === 'ar' ? 'ar-u-nu-latn' : locale);
export const weekStartsOn = (locale: string): number => (locale === 'ar' ? 6 : 1);
export const fmtTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
