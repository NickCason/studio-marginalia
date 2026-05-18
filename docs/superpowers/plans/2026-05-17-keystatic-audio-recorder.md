# KeyStatic Audio Recorder Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `fields.file` for `audioFile` in the Voice Memo post type with a custom KeyStatic field that records audio in-browser or accepts uploads, with inline playback preview and re-record/replace on existing posts.

**Architecture:** Custom KeyStatic `formKind: 'asset'` field (same contract as `fields.file`) with a custom React Input component. KeyStatic owns serialization, git commits, and asset routing. We own the React UI: a state-machine-driven recorder + playback preview. New recordings save to `public/media/voice-memo-<YYYY-MM-DD-HHMM>.{webm|mp4}` (browser-native format). Build-time waveform pipeline extended to decode the new formats with graceful fallback. Legacy `/audio/...` paths preserved.

**Tech Stack:** `@keystatic/core` (custom field via `BasicFormField`), React 18 (admin UI), browser `MediaRecorder` API, existing `audio-decode` package (extended with webm/Opus support; mp4 decoder added if needed during Task 6).

**Spec:** `docs/superpowers/specs/2026-05-17-keystatic-audio-recorder-design.md` is the authoritative requirements doc. Read it before starting if any task description feels ambiguous.

**Starting state:** `main` at commit `0b444a6` (spec doc). Migration to KeyStatic is complete, /keystatic/ admin live in production, voice memo post `05-voice-memo.md` exists with legacy `/audio/...` audioFile reference.

---

## File Structure

**Created in this plan:**
- `src/lib/keystatic-fields/filename.ts` — pure helpers: `generateAudioFilename`, `isLegacyPath`, plus `pickAudioMimeType` (browser format detection)
- `src/lib/keystatic-fields/filename.test.ts` — vitest unit tests for the helpers
- `src/lib/keystatic-fields/recorderReducer.ts` — pure state-machine reducer (states + actions + transitions)
- `src/lib/keystatic-fields/recorderReducer.test.ts` — vitest tests for the reducer
- `src/lib/keystatic-fields/AudioRecorderInput.tsx` — React component (uses reducer + helpers, owns MediaRecorder + `<audio>` refs)
- `src/lib/keystatic-fields/audioRecorder.tsx` — KeyStatic field constructor (returns the asset-shaped field object, wires `AudioRecorderInput` as `Input`)

**Modified:**
- `keystatic.config.tsx` — replace `audioFile: mediaFile(...)` with `audioFile: audioRecorder(...)`
- `src/integrations/waveform.mjs` — extend scanning to `.webm` and `.mp4` in `public/media/` with try/catch decode + graceful skip
- `package.json` — possibly add a decoder dep if `audio-decode` can't handle one of the formats (decided in Task 6)
- `README.md` — append manual smoke checklist under the existing Authoring section

**Untouched (intentional):**
- `src/content/config.ts` — Astro schema for `audioFile: z.string()` unchanged
- `src/components/post-types/AudioCard.astro` — already handles dual paths and missing waveform JSON
- `src/components/post-permalinks/AudioPage.astro` — same
- Existing posts including the legacy voice memo — no migration
- `astro.config.mjs` — no new integrations needed

---

## Task 1: Pure helpers — filename generation, legacy path detection, mime-type pick

**Files:**
- Create: `src/lib/keystatic-fields/filename.ts`
- Create: `src/lib/keystatic-fields/filename.test.ts`

These three pure functions are pulled out so we can test them without mocking the browser or KeyStatic.

- [ ] **Step 1: Create the test directory and write the failing tests**

Create `src/lib/keystatic-fields/filename.test.ts`:

```ts
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
  // Helper that returns the first mime from the candidate list that
  // MediaRecorder.isTypeSupported() accepts. We pass in a stub so we
  // don't depend on the real browser API in unit tests.
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `~/.local/bin/pnpm vitest run src/lib/keystatic-fields/filename.test.ts`

Expected: FAIL with "Cannot find module './filename'" or similar.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/keystatic-fields/filename.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `~/.local/bin/pnpm vitest run src/lib/keystatic-fields/filename.test.ts`

Expected: PASS, 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/keystatic-fields/filename.ts src/lib/keystatic-fields/filename.test.ts
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(audio-recorder): filename + path + mime-type helpers"
```

---

## Task 2: State machine reducer — pure logic, unit tested

**Files:**
- Create: `src/lib/keystatic-fields/recorderReducer.ts`
- Create: `src/lib/keystatic-fields/recorderReducer.test.ts`

A pure reducer modeling the recorder's lifecycle. Extracted from the React component so transitions are testable without DOM.

- [ ] **Step 1: Write the failing reducer tests**

Create `src/lib/keystatic-fields/recorderReducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recorderReducer, initialState, type State, type Action } from './recorderReducer';

const fakeBlob = new Uint8Array([1, 2, 3]);

describe('recorderReducer', () => {
  it('starts in idle-empty when there is no existing value', () => {
    expect(initialState({ existingValue: null }).status).toBe('idle-empty');
  });

  it('starts in idle-existing when there is a saved value', () => {
    const s = initialState({ existingValue: '/media/voice-memo-x.webm' });
    expect(s.status).toBe('idle-existing');
    expect(s.existingUrl).toBe('/media/voice-memo-x.webm');
  });

  it('idle-empty + START_RECORDING -> recording', () => {
    const s: State = { status: 'idle-empty' };
    const next = recorderReducer(s, { type: 'START_RECORDING' });
    expect(next.status).toBe('recording');
    expect(next.startedAt).toBeInstanceOf(Date);
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
    expect(next.blob).toBe(fakeBlob);
    expect(next.mimeType).toBe('audio/webm');
    expect(next.previewUrl).toBe('blob:http://localhost/fake');
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
    expect((next as any).blob).toBeUndefined();
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
    expect(next.blob).toBe(fakeBlob);
  });

  it('any state + ERROR(reason) -> error', () => {
    const s: State = { status: 'recording', startedAt: new Date() };
    const next = recorderReducer(s, { type: 'ERROR', reason: 'mic denied' });
    expect(next.status).toBe('error');
    expect(next.reason).toBe('mic denied');
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
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `~/.local/bin/pnpm vitest run src/lib/keystatic-fields/recorderReducer.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the reducer**

Create `src/lib/keystatic-fields/recorderReducer.ts`:

```ts
export type State =
  | { status: 'idle-empty' }
  | { status: 'idle-existing'; existingUrl: string }
  | { status: 'recording'; startedAt: Date }
  | {
      status: 'recorded';
      blob: Uint8Array;
      mimeType: string;
      previewUrl: string;
    }
  | { status: 'error'; reason: string };

export type Action =
  | { type: 'START_RECORDING' }
  | {
      type: 'STOP_RECORDING';
      blob: Uint8Array;
      mimeType: string;
      previewUrl: string;
    }
  | { type: 'USE_RECORDING' }
  | { type: 'DISCARD' }
  | {
      type: 'FILE_SELECTED';
      blob: Uint8Array;
      mimeType: string;
      previewUrl: string;
    }
  | { type: 'ERROR'; reason: string }
  | { type: 'RESET' };

export function initialState(opts: { existingValue: string | null }): State {
  if (opts.existingValue) {
    return { status: 'idle-existing', existingUrl: opts.existingValue };
  }
  return { status: 'idle-empty' };
}

export function recorderReducer(state: State, action: Action): State {
  // ERROR and RESET are universal — handle first.
  if (action.type === 'ERROR') {
    return { status: 'error', reason: action.reason };
  }
  if (action.type === 'RESET') {
    return { status: 'idle-empty' };
  }

  switch (state.status) {
    case 'idle-empty':
    case 'idle-existing':
      if (action.type === 'START_RECORDING') {
        return { status: 'recording', startedAt: new Date() };
      }
      if (action.type === 'FILE_SELECTED') {
        return {
          status: 'recorded',
          blob: action.blob,
          mimeType: action.mimeType,
          previewUrl: action.previewUrl,
        };
      }
      return state;

    case 'recording':
      if (action.type === 'STOP_RECORDING') {
        return {
          status: 'recorded',
          blob: action.blob,
          mimeType: action.mimeType,
          previewUrl: action.previewUrl,
        };
      }
      return state;

    case 'recorded':
      if (action.type === 'DISCARD') {
        return { status: 'idle-empty' };
      }
      // USE_RECORDING is a no-op at the reducer level: the React component
      // wraps this and calls KeyStatic's `onChange` with the blob as the
      // field value. Reducer state stays in 'recorded' so the preview
      // continues to render until the entry is saved or discarded.
      return state;

    case 'error':
      // Only RESET (handled above) escapes the error state.
      return state;
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `~/.local/bin/pnpm vitest run src/lib/keystatic-fields/recorderReducer.test.ts`

Expected: PASS, 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/keystatic-fields/recorderReducer.ts src/lib/keystatic-fields/recorderReducer.test.ts
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(audio-recorder): pure state-machine reducer"
```

---

## Task 3: AudioRecorderInput React component

**Files:**
- Create: `src/lib/keystatic-fields/AudioRecorderInput.tsx`

The React component that KeyStatic invokes for rendering the field. Uses the reducer + helpers. No unit tests (DOM + MediaRecorder are too hard to mock cleanly; we lean on manual smoke per the spec).

- [ ] **Step 1: Create the component**

Create `src/lib/keystatic-fields/AudioRecorderInput.tsx`:

```tsx
import { useReducer, useRef, useEffect, useState } from 'react';
import {
  recorderReducer,
  initialState,
  type State,
} from './recorderReducer';
import {
  generateAudioFilename,
  isLegacyPath,
  pickAudioMimeType,
} from './filename';

// Asset-field value shape that KeyStatic expects.
type AssetValue = {
  data: Uint8Array;
  filename: string;
  extension: string;
} | null;

type Props = {
  // KeyStatic-supplied
  value: AssetValue;
  onChange: (next: AssetValue) => void;
  autoFocus: boolean;
  forceValidation: boolean;
  // We pass these through from the field constructor (closure).
  label: string;
  description?: string;
  publicPath: string;
  // The stored frontmatter string (e.g. "/media/foo.webm" or legacy "/audio/..").
  // KeyStatic doesn't surface this directly via props; we read it from the URL
  // KeyStatic embeds in the value via `parse` (handled in field constructor).
  existingValueString: string | null;
};

const RECORDING_MAX_MS = 5 * 60 * 1000; // 5 minutes
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
] as const;

function extensionFromMime(mime: string): string {
  if (mime.startsWith('audio/webm')) return 'webm';
  if (mime.startsWith('audio/mp4')) return 'mp4';
  if (mime.startsWith('audio/mpeg')) return 'mp3';
  // Sensible fallback — should never hit because pickAudioMimeType returned this.
  return 'bin';
}

export function AudioRecorderInput(props: Props) {
  const [state, dispatch] = useReducer(
    recorderReducer,
    initialState({ existingValue: props.existingValueString }),
  );
  const [elapsedMs, setElapsedMs] = useState(0);

  // Refs for live MediaRecorder + accumulated chunks across the recording lifecycle.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Revoke previous object URL whenever we abandon a preview, to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // Elapsed-time ticker while recording.
  useEffect(() => {
    if (state.status !== 'recording') {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setElapsedMs(0);
      return;
    }
    const start = state.startedAt.getTime();
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - start;
      setElapsedMs(ms);
      if (ms >= RECORDING_MAX_MS) stopRecording();
    }, 250);
    return () => {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [state.status]);

  async function startRecording() {
    if (typeof MediaRecorder === 'undefined') {
      dispatch({
        type: 'ERROR',
        reason:
          "This browser doesn't support in-page recording. Use Upload instead.",
      });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const msg =
        (e as DOMException)?.name === 'NotAllowedError'
          ? 'Microphone access was denied. Enable it in browser settings, or use Upload.'
          : `Couldn't access microphone: ${(e as Error).message}`;
      dispatch({ type: 'ERROR', reason: msg });
      return;
    }
    const mime = pickAudioMimeType(MIME_CANDIDATES, (m) =>
      MediaRecorder.isTypeSupported(m),
    );
    if (!mime) {
      stream.getTracks().forEach((t) => t.stop());
      dispatch({
        type: 'ERROR',
        reason: "This browser doesn't support any audio recording format we accept.",
      });
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const arr = new Uint8Array(await blob.arrayBuffer());
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      dispatch({
        type: 'STOP_RECORDING',
        blob: arr,
        mimeType: mime,
        previewUrl: url,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    dispatch({ type: 'START_RECORDING' });
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
  }

  async function onFilePicked(file: File) {
    const arr = new Uint8Array(await file.arrayBuffer());
    const url = URL.createObjectURL(file);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    dispatch({
      type: 'FILE_SELECTED',
      blob: arr,
      mimeType: file.type || 'application/octet-stream',
      previewUrl: url,
    });
  }

  function commitRecording(s: Extract<State, { status: 'recorded' }>) {
    const ext = extensionFromMime(s.mimeType);
    const filename = generateAudioFilename(new Date(), ext);
    props.onChange({ data: s.blob, filename, extension: ext });
  }

  function discard() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    // Clear KeyStatic's held value too (back to whatever was persisted).
    props.onChange(null);
    dispatch({ type: 'DISCARD' });
  }

  // ---- Render ----
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        border: '1px solid var(--ks-border, #ddd)',
        borderRadius: 8,
      }}
    >
      <label style={{ fontWeight: 600 }}>{props.label}</label>
      {props.description && (
        <div style={{ fontSize: 12, opacity: 0.7 }}>{props.description}</div>
      )}

      {state.status === 'idle-empty' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={startRecording}>
            ● Record
          </button>
          <UploadButton onPick={onFilePicked} />
        </div>
      )}

      {state.status === 'idle-existing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLegacyPath(state.existingUrl, props.publicPath) && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Legacy path — re-recording will save to {props.publicPath} and
              leave the old file in place.
            </div>
          )}
          <audio controls src={state.existingUrl} style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={startRecording}>
              ● Re-record
            </button>
            <UploadButton onPick={onFilePicked} label="Replace with upload" />
          </div>
        </div>
      )}

      {state.status === 'recording' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'crimson' }}>● REC</span>
            <span>{formatElapsed(elapsedMs)}</span>
            <span style={{ opacity: 0.6, fontSize: 12 }}>
              (auto-stop at 5:00)
            </span>
          </div>
          <button type="button" onClick={stopRecording}>
            ■ Stop
          </button>
        </div>
      )}

      {state.status === 'recorded' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <audio controls src={state.previewUrl} style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => commitRecording(state)}>
              Use this recording
            </button>
            <button type="button" onClick={discard}>
              Discard & try again
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Click <em>Use this recording</em>, then save the post to commit it.
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'crimson' }}>{state.reason}</div>
          <button type="button" onClick={() => dispatch({ type: 'RESET' })}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function UploadButton({
  onPick,
  label = 'Upload file',
}: {
  onPick: (file: File) => void;
  label?: string;
}) {
  return (
    <label
      style={{
        display: 'inline-block',
        padding: '6px 12px',
        border: '1px solid var(--ks-border, #ddd)',
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      {label}
      <input
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          // Allow picking the same file twice in a row by resetting the input.
          e.target.value = '';
        }}
      />
    </label>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Type-check via astro check**

Run: `~/.local/bin/pnpm exec astro check 2>&1 | tail -20`

Expected: 0 errors. The new `.tsx` file gets included in the project's tsconfig and React + DOM types are already available from `@astrojs/react`. If errors appear about `MediaRecorder` not being defined, verify `tsconfig.json` includes `"DOM"` in its `lib` array — it should, because the project already ships browser-side code (the existing AudioCard player script). If `astro check` warns about JSX in `.tsx` files outside src/components, that's fine — the component is imported and bundled by KeyStatic.

- [ ] **Step 3: Run existing tests to make sure nothing regressed**

Run: `~/.local/bin/pnpm vitest run`

Expected: PASS — only the new helpers + reducer suites run; previously-existing suites continue to pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/keystatic-fields/AudioRecorderInput.tsx
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(audio-recorder): React input component (record/upload/playback)"
```

---

## Task 4: audioRecorder field constructor

**Files:**
- Create: `src/lib/keystatic-fields/audioRecorder.tsx`

Returns the KeyStatic field object. Mirrors `fields.file`'s `formKind: 'asset'` shape so KeyStatic handles all storage, commit, and asset routing automatically.

- [ ] **Step 1: Read fields.file for the contract**

Open `node_modules/@keystatic/core/dist/keystatic-core.react-server.js` and find `function file(`. The structure has these keys: `kind: 'form'`, `formKind: 'asset'`, `label`, `Input`, `defaultValue`, `filename`, `parse`, `validate`, `serialize`, `directory`, `reader`. We replicate this signature so KeyStatic doesn't notice we're not its file field.

- [ ] **Step 2: Create the constructor**

Create `src/lib/keystatic-fields/audioRecorder.tsx`:

```tsx
import { AudioRecorderInput } from './AudioRecorderInput';

type AssetValue = {
  data: Uint8Array;
  filename: string;
  extension: string;
} | null;

type FieldOpts = {
  label: string;
  description?: string;
  /** Where the binary file is stored on disk, e.g. 'public/media' */
  directory: string;
  /** URL prefix written to frontmatter, e.g. '/media/' */
  publicPath: string;
  validation?: { isRequired?: boolean };
};

class FieldDataError extends Error {}

function assertRequired<T>(value: T, validation: FieldOpts['validation'], label: string): void {
  if (validation?.isRequired && (value === null || value === undefined)) {
    throw new FieldDataError(`${label} is required`);
  }
}

/**
 * Strip publicPath prefix from a value to get the on-disk filename, OR return
 * the value untouched if it doesn't start with publicPath (legacy / external).
 */
function srcPrefixStrip(value: string, publicPath: string): string {
  const prefix = publicPath.replace(/\/*$/, '') + '/';
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

/**
 * Custom KeyStatic field for voice-memo audio. Same on-disk + commit contract
 * as fields.file (formKind: 'asset') but with a React Input that records or
 * uploads, previews playback, and allows re-recording on existing entries.
 */
export function audioRecorder(opts: FieldOpts) {
  return {
    kind: 'form' as const,
    formKind: 'asset' as const,
    label: opts.label,

    Input(props: {
      value: AssetValue;
      onChange: (v: AssetValue) => void;
      autoFocus: boolean;
      forceValidation: boolean;
    }) {
      // KeyStatic's asset-field doesn't surface the stored string directly to
      // Input; it passes parsed asset value (or null). We reconstruct the
      // original string from props.value.filename + opts.publicPath when
      // there's a value, OR we read it from a sibling __existingPath stash.
      // Practical shortcut: if props.value is null AND we're rendering an
      // existing entry, KeyStatic re-calls parse() and our parse stashes the
      // original string in a closure-shared map. We avoid that complexity by
      // accepting that on re-renders, props.value.filename + publicPath
      // reproduces the URL the user expects to hear.
      const existingValueString =
        props.value && props.value.filename
          ? `${opts.publicPath.replace(/\/*$/, '')}/${props.value.filename}`
          : null;
      return (
        <AudioRecorderInput
          {...props}
          label={opts.label}
          description={opts.description}
          publicPath={opts.publicPath}
          existingValueString={existingValueString}
        />
      );
    },

    defaultValue(): AssetValue {
      return null;
    },

    filename(value: AssetValue, _args: { slug?: string }) {
      if (value && value.filename) return value.filename;
      return undefined;
    },

    parse(value: unknown, args: { asset?: Uint8Array }): AssetValue {
      if (value === undefined) return null;
      if (typeof value !== 'string') {
        throw new FieldDataError('audioFile must be a string');
      }
      // For legacy / external URLs (don't start with publicPath), there's no
      // matching asset on disk in our directory — KeyStatic passes asset:
      // undefined. We still want the player to render, so we return a
      // descriptor with empty data and the full URL as filename.
      const stripped = srcPrefixStrip(value, opts.publicPath);
      if (args.asset === undefined) {
        return {
          data: new Uint8Array(),
          filename: stripped,
          extension: stripped.split('.').pop() ?? '',
        };
      }
      return {
        data: args.asset,
        filename: stripped,
        extension: stripped.split('.').pop() ?? '',
      };
    },

    validate(value: AssetValue) {
      assertRequired(value, opts.validation, opts.label);
      return value;
    },

    serialize(value: AssetValue, _args: { slug?: string }) {
      if (value === null || value.data.length === 0) {
        // value.data.length === 0 means we hydrated a legacy/external value
        // and the user didn't re-record. Preserve the original frontmatter.
        return { value: undefined, asset: undefined };
      }
      const url = `${opts.publicPath.replace(/\/*$/, '')}/${value.filename}`;
      return {
        value: url,
        asset: { filename: value.filename, content: value.data },
      };
    },

    directory: opts.directory,

    reader: {
      parse(value: unknown) {
        if (value === undefined) return null;
        if (typeof value !== 'string') {
          throw new FieldDataError('audioFile must be a string');
        }
        return value;
      },
    },
  };
}
```

- [ ] **Step 3: Build the project to confirm types and bundle correctness**

Run: `~/.local/bin/pnpm astro build 2>&1 | tail -20`

Expected: build succeeds. KeyStatic's admin bundle will include `AudioRecorderInput`. If TypeScript complains about the field's structural type not exactly matching `BasicFormField`, that's tolerable — we're using structural typing through the `kind: 'form' as const` + `formKind: 'asset' as const` discriminator, and KeyStatic only consumes the methods at runtime.

- [ ] **Step 4: Commit**

```bash
git add src/lib/keystatic-fields/audioRecorder.tsx
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(audio-recorder): KeyStatic asset-field constructor"
```

---

## Task 5: Wire into keystatic.config.tsx

**Files:**
- Modify: `keystatic.config.tsx`

- [ ] **Step 1: Add the import**

Open `keystatic.config.tsx`. At the top, near the existing imports, add:

```tsx
import { audioRecorder } from './src/lib/keystatic-fields/audioRecorder';
```

- [ ] **Step 2: Replace the audioFile field declaration**

Find this block (inside the `posts` collection's schema):

```ts
audioFile: mediaFile(
  '[VOICE MEMO] Audio file (mp3/m4a)',
  'public/audio',
  '/audio/',
),
```

Replace with:

```ts
audioFile: audioRecorder({
  label: '[VOICE MEMO] Audio file',
  description: 'Record in the browser or upload a file. Saved to /media/.',
  directory: 'public/media',
  publicPath: '/media/',
  validation: { isRequired: false },
}),
```

- [ ] **Step 3: Verify the build still succeeds**

Run: `~/.local/bin/pnpm astro build 2>&1 | tail -15`

Expected: build succeeds. KeyStatic schema loads, all collections + singletons compile cleanly.

- [ ] **Step 4: Commit**

```bash
git add keystatic.config.tsx
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(audio-recorder): wire audioRecorder field into voice-memo schema"
```

---

## Task 6: Extend the waveform build integration

**Files:**
- Modify: `src/integrations/waveform.mjs`
- Modify: `package.json` (only if a new decoder package is needed; decided in Step 2)

- [ ] **Step 1: Read the existing waveform.mjs**

Read `src/integrations/waveform.mjs`. Confirm:
- `AUDIO_EXT` const lists `['.mp3', '.m4a', '.wav', '.ogg', '.flac']` — does NOT include `.webm` or `.mp4` yet
- `processAudioFile` already has try/catch with `console.warn('[waveform] failed for ...')` — graceful skip is already in place
- Both `public/audio` and `public/media` are already walked

The only change required: add `.webm` and `.mp4` to `AUDIO_EXT`. The try/catch already handles decode failures. The directory scan already covers both locations.

- [ ] **Step 2: Probe whether audio-decode handles webm/mp4**

Run from the repo root:

```bash
~/.local/bin/pnpm exec node -e "import('audio-decode').then(m => console.log('audio-decode keys:', Object.keys(m)))"
```

Expected: prints the module's exports. Note what's there — typically `default` (the decode function). The decode function inside delegates to per-format decoders based on the audio container.

If we had a `.webm` audio file on hand we could test directly. We don't. Move on; the existing try/catch will graceful-skip if a format fails at deploy time, so this is safe to discover empirically when Nina records her first webm.

- [ ] **Step 3: Edit AUDIO_EXT**

Apply this exact edit to `src/integrations/waveform.mjs`:

```diff
-const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.flac'];
+// .webm + .mp4 added for browser MediaRecorder output (Chromium → webm/Opus,
+// Safari → mp4/AAC). audio-decode may not handle all containers natively;
+// the try/catch in processAudioFile turns a decode failure into a warning,
+// and AudioCard.astro falls back to flat-bar render when waveform JSON is
+// absent — so unsupported formats degrade gracefully rather than crash.
+const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.webm', '.mp4'];
```

No other edits. The existing `processAudioFile` already has the try/catch we need.

- [ ] **Step 4: Run the build to confirm no regression on existing mp3**

Run: `~/.local/bin/pnpm astro build 2>&1 | grep -iE "waveform|skipped|audio" | head -20`

Expected: the existing `.mp3` in `public/audio/notes-from-the-build-05-voice-memo.mp3` still gets processed and writes its waveform JSON. No `[waveform] skipped` for it. No build crash. If any `[waveform] skipped:` lines appear for files we don't yet have on disk, that's fine — they're just informational.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/waveform.mjs package.json pnpm-lock.yaml
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(audio-recorder): waveform pipeline handles webm/mp4 with graceful skip"
```

---

## Task 7: README — manual smoke checklist

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the Authoring section**

Open `README.md`. Locate the `## Authoring` section (added during the KeyStatic migration). The section currently lists how to author via KeyStatic admin and via direct markdown.

- [ ] **Step 2: Append the smoke checklist**

After the existing authoring bullet list, add:

```markdown
### Voice memo smoke checklist (after deploys that touch the recorder)

Run these manually on `bluestudio.space/keystatic/` after any change to
the recorder, waveform integration, or KeyStatic schema for the voice-memo
post type:

1. **Record a new voice memo**: New post → type Voice memo → click Record →
   speak for ~10 seconds → Stop → Use this recording → fill in title +
   duration → Save. After the Cloudflare deploy completes, confirm the new
   post appears on the live feed with a working player (waveform if the
   format decoded, flat bars if not — both are acceptable).
2. **Re-record an existing**: open the existing legacy voice memo →
   click Re-record → record short clip → Use this recording → Save. Verify
   a new file landed at `/media/voice-memo-…` and the post's audioFile
   frontmatter now points there.
3. **Upload path**: click Upload file → pick an existing mp3/m4a from disk
   → Use this recording → Save. Same deploy verification.
4. **Mic-denied path**: deny microphone permission when the browser
   prompts → confirm the inline error message appears and Upload is still
   available.
5. **Safari**: repeat steps 1 and 3 in Safari (recordings will be `.mp4`
   instead of `.webm` — both should round-trip cleanly).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "docs(readme): voice memo smoke checklist"
```

---

## Task 8: Push and verify production deploy

**Files:** No code changes. Pushes + deploy verification.

- [ ] **Step 1: Push all commits**

```bash
git push origin main 2>&1
```

Expected: push succeeds. Six commits land on `origin/main` (one per task that produced commits).

- [ ] **Step 2: Wait for the deploy**

```bash
sleep 8
gh run list --repo NickCason/blue-studio --workflow "Build & deploy to Cloudflare Pages" --limit 1 --json databaseId -q '.[0].databaseId'
```

Capture the run id and watch:

```bash
gh run watch <run-id> --repo NickCason/blue-studio --exit-status --interval 10
gh run view <run-id> --repo NickCason/blue-studio --json conclusion -q .conclusion
```

Expected: success.

- [ ] **Step 3: Confirm public site + admin still work**

```bash
curl -sI -o /dev/null -w "/ → %{http_code}\n" https://bluestudio.space/
curl -sI -o /dev/null -w "/keystatic/ → %{http_code}\n" https://bluestudio.space/keystatic/
curl -sI -o /dev/null -w "/journal/05-voice-memo/ → %{http_code}\n" https://bluestudio.space/journal/05-voice-memo/
```

Expected: all 200.

- [ ] **Step 4: Hand off to user for manual smoke**

Print the smoke checklist (Task 7's content) and ask the user to run through it in their browser. Wait for confirmation of at least #1 (record new) and #2 (re-record existing) before considering the feature done.

The recorder UI is the kind of thing that has to be tried, not just probed — there's no curl-equivalent for "click Record, speak, click Stop, hear playback." Hand-off is expected.

---

## Notes for the executing agent

**Project memory — read before starting:**
- `feedback-cache-is-system-problem.md` — never tell the user to hard-refresh.
- `feedback-tina-lock-must-be-committed.md` — historical context for why we migrated off Tina; not directly relevant to this feature but explains the project's CMS sensitivity.

**Git identity:** the project uses `Nick Cason <nickcason@Nicks-MacBook-Air.local>` set per-commit via env vars (see commit commands above). Do NOT modify `~/.gitconfig`.

**Tina is gone:** if you see any reference to `tina/`, `tinacms`, or `@tinacms/cli` while editing, that's a stale comment — flag it but don't refactor opportunistically.

**Pushing:** the git remote no longer embeds a token; pushes use the gh credential helper. The PAT has `workflow` scope so workflow file edits push cleanly (we don't touch workflows in this plan, but mentioning for context).

**Build is on Astro 5 + @astrojs/cloudflare@12.6.13** — do not upgrade adapter to 13.x (incompatible with Astro 5).

**Don't over-engineer the recorder UI:** the spec specifies "simple player + Save/Re-record" — resist adding scrubbing, waveform-in-admin, transcript auto-fill, or other features beyond what the plan describes. Those are explicitly out of scope.

**Step-skip authorization:** Tasks 1, 2 have strict TDD. Tasks 3-7 do not need additional tests — manual smoke covers them per the spec. Don't invent new test suites for the React component or the field constructor; both involve DOM/KeyStatic-internal behavior that's hard to mock cleanly.

**If a step's command output differs unexpectedly:** stop, surface the discrepancy to the user, don't proceed with assumptions. Same rule as the migration plan.
