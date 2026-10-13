import { brand } from '../config/brand';

const formatters = new Map<string, Intl.NumberFormat>();

/** Format rupiah, mis. 38000 -> "Rp 38.000". */
export function formatIDR(amount: number, locale: string = brand.locale): string {
  let f = formatters.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: brand.currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
    formatters.set(locale, f);
  }
  return f.format(amount);
}

/** Dua digit dengan nol di depan: 3 -> "03". */
export const pad2 = (n: number): string => String(n).padStart(2, '0');
