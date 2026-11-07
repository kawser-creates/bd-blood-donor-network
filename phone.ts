const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Accepts 017XXXXXXXX, +88017XXXXXXXX, 88017XXXXXXXX (Bangla digits allowed). Returns E.164 (+8801XXXXXXXXX) or null. */
export function normalizeBdPhone(input: string): string | null {
  let n = input
    .replace(/[\s-]/g, '')
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  if (n.startsWith('+880')) n = '0' + n.slice(4);
  else if (n.startsWith('880')) n = '0' + n.slice(3);
  return /^01[3-9]\d{8}$/.test(n) ? '+880' + n.slice(1) : null;
}
