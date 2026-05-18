/**
 * Generates a deterministic filename for a new voice memo recording.
 * Format: voice-memo-YYYY-MM-DD-HHMM.<extension>
 * All time components are UTC so filenames are stable across timezones.
 */
export function generateAudioFilename(date: Date, extension: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  return `voice-memo-${y}-${m}-${d}-${h}${min}.${extension}`;
}

/**
 * Returns true if the stored audioFile value points outside the field's
 * configured publicPath. Used to detect legacy `/audio/...` references
 * from before the recorder existed — those are rendered as opaque URLs
 * rather than tracked as in-collection assets.
 */
export function isLegacyPath(value: string, publicPath: string): boolean {
  if (!value) return false;
  return !value.startsWith(publicPath);
}

/**
 * Picks the first mime type from `candidates` that `isSupported` returns
 * true for. `isSupported` is injected so this is testable without the
 * browser (in the component, pass `MediaRecorder.isTypeSupported`).
 */
export function pickAudioMimeType(
  candidates: readonly string[],
  isSupported: (mime: string) => boolean,
): string | null {
  for (const mime of candidates) {
    if (isSupported(mime)) return mime;
  }
  return null;
}
