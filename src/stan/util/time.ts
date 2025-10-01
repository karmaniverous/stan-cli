/**
 * UTC timestamp in YYYYMMDD-HHMMSS for filenames and logs.
 */
export const utcStamp = (): string => {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
    d.getUTCDate(),
  )}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
};

/**
 * Convert a UTC stamp (YYYYMMDD-HHMMSS) to a local time string.
 * Falls back to the original stamp if parsing fails.
 *
 * @param ts - UTC stamp in the form YYYYMMDD-HHMMSS.
 * @returns Local time string "YYYY-MM-DD HH:MM:SS", or the original input if parsing fails.
 */
export const formatUtcStampLocal = (ts: string): string => {
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return ts;
  const [, y, mo, d, h, mi, s] = m.map((x) => Number.parseInt(x ?? '', 10));
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Fixed-width local: YYYY-MM-DD HH:MM:SS
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = dt.getFullYear();
  const MM = pad(dt.getMonth() + 1);
  const DD = pad(dt.getDate());
  const HH = pad(dt.getHours());
  const MMi = pad(dt.getMinutes());
  const SS = pad(dt.getSeconds());
  return `${yyyy}-${MM}-${DD} ${HH}:${MMi}:${SS}`;
};
