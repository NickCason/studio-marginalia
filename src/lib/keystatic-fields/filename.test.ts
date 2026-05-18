import { describe, it, expect } from 'vitest';
import {
  generateAudioFilename,
  isLegacyPath,
  pickAudioMimeType,
} from './filename';

describe('generateAudioFilename', () => {
  it('formats date as voice-memo-YYYY-MM-DD-HHMM.<ext>', () => {
    // 2026-05-17T22:30:15Z
    const d = new Date(Date.UTC(2026, 4, 17, 22, 30, 15));
    expect(generateAudioFilename(d, 'webm')).toBe('voice-memo-2026-05-17-2230.webm');
  });

  it('pads single-digit month, day, hour, minute', () => {
    // 2026-01-02T03:04:05Z
    const d = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(generateAudioFilename(d, 'mp4')).toBe('voice-memo-2026-01-02-0304.mp4');
  });

  it('keeps extension verbatim (caller is responsible for cleanliness)', () => {
    const d = new Date(Date.UTC(2026, 4, 17, 22, 30, 0));
    expect(generateAudioFilename(d, 'ogg')).toBe('voice-memo-2026-05-17-2230.ogg');
  });
});

describe('isLegacyPath', () => {
  it('returns true when value does not start with the configured publicPath', () => {
    expect(isLegacyPath('/audio/old-thing.mp3', '/media/')).toBe(true);
  });

  it('returns false when value starts with the configured publicPath', () => {
    expect(isLegacyPath('/media/voice-memo-2026-05-17-2230.webm', '/media/')).toBe(false);
  });

  it('returns false for empty / nullish values (no path = no legacy)', () => {
    expect(isLegacyPath('', '/media/')).toBe(false);
  });
});

describe('pickAudioMimeType', () => {
  it('returns the first supported candidate', () => {
    const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
    const isSupported = (m: string) => m === 'audio/mp4';
    expect(pickAudioMimeType(candidates, isSupported)).toBe('audio/mp4');
  });

  it('returns null when nothing is supported', () => {
    expect(pickAudioMimeType(['audio/x-unobtanium'], () => false)).toBeNull();
  });

  it('returns the first candidate when all are supported (preference order)', () => {
    const candidates = ['audio/webm;codecs=opus', 'audio/mp4'];
    expect(pickAudioMimeType(candidates, () => true)).toBe('audio/webm;codecs=opus');
  });
});
