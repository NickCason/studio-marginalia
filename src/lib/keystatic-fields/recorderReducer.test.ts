import { describe, it, expect } from 'vitest';
import { recorderReducer, initialState, type State } from './recorderReducer';

const fakeBlob = new Uint8Array([1, 2, 3]);

describe('recorderReducer', () => {
  it('starts in idle-empty when there is no existing value', () => {
    expect(initialState({ existingValue: null }).status).toBe('idle-empty');
  });

  it('starts in idle-existing when there is a saved value', () => {
    const s = initialState({ existingValue: '/media/voice-memo-x.webm' });
    expect(s.status).toBe('idle-existing');
    if (s.status === 'idle-existing') {
      expect(s.existingUrl).toBe('/media/voice-memo-x.webm');
    }
  });

  it('idle-empty + START_RECORDING -> recording', () => {
    const s: State = { status: 'idle-empty' };
    const next = recorderReducer(s, { type: 'START_RECORDING' });
    expect(next.status).toBe('recording');
    if (next.status === 'recording') {
      expect(next.startedAt).toBeInstanceOf(Date);
    }
  });

  it('recording + STOP_RECORDING(blob) -> recorded with blob and url', () => {
    const s: State = { status: 'recording', startedAt: new Date() };
    const next = recorderReducer(s, {
      type: 'STOP_RECORDING',
      blob: fakeBlob,
      mimeType: 'audio/webm',
      previewUrl: 'blob:http://localhost/fake',
    });
    expect(next.status).toBe('recorded');
    if (next.status === 'recorded') {
      expect(next.blob).toBe(fakeBlob);
      expect(next.mimeType).toBe('audio/webm');
      expect(next.previewUrl).toBe('blob:http://localhost/fake');
    }
  });

  it('recorded + USE_RECORDING is a no-op state-wise (parent commits via onChange)', () => {
    const s: State = {
      status: 'recorded',
      blob: fakeBlob,
      mimeType: 'audio/webm',
      previewUrl: 'blob:x',
    };
    const next = recorderReducer(s, { type: 'USE_RECORDING' });
    expect(next.status).toBe('recorded'); // parent decides whether to commit
  });

  it('recorded + DISCARD -> idle-empty (clears blob and url)', () => {
    const s: State = {
      status: 'recorded',
      blob: fakeBlob,
      mimeType: 'audio/webm',
      previewUrl: 'blob:x',
    };
    const next = recorderReducer(s, { type: 'DISCARD' });
    expect(next.status).toBe('idle-empty');
    if (next.status === 'idle-empty') {
      expect((next as any).blob).toBeUndefined();
    }
  });

  it('idle-empty + FILE_SELECTED(blob) -> recorded', () => {
    const s: State = { status: 'idle-empty' };
    const next = recorderReducer(s, {
      type: 'FILE_SELECTED',
      blob: fakeBlob,
      mimeType: 'audio/mp4',
      previewUrl: 'blob:y',
    });
    expect(next.status).toBe('recorded');
    if (next.status === 'recorded') {
      expect(next.blob).toBe(fakeBlob);
    }
  });

  it('any state + ERROR(reason) -> error', () => {
    const s: State = { status: 'recording', startedAt: new Date() };
    const next = recorderReducer(s, { type: 'ERROR', reason: 'mic denied' });
    expect(next.status).toBe('error');
    if (next.status === 'error') {
      expect(next.reason).toBe('mic denied');
    }
  });

  it('error + RESET -> idle-empty', () => {
    const s: State = { status: 'error', reason: 'mic denied' };
    const next = recorderReducer(s, { type: 'RESET' });
    expect(next.status).toBe('idle-empty');
  });

  it('idle-existing + START_RECORDING -> recording (replacing existing)', () => {
    const s: State = { status: 'idle-existing', existingUrl: '/media/old.webm' };
    const next = recorderReducer(s, { type: 'START_RECORDING' });
    expect(next.status).toBe('recording');
  });
});
