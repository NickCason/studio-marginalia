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

function extensionFromMime(mime: string): string | null {
  if (mime.startsWith('audio/webm')) return 'webm';
  if (mime.startsWith('audio/mp4')) return 'mp4';
  if (mime.startsWith('audio/mpeg')) return 'mp3';
  return null;
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
      // Also kill any in-flight recorder + tracks so the mic indicator goes away.
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
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
      // Capture chunks BEFORE awaiting — a fresh startRecording can swap
      // chunksRef.current out from under us between Stop click and arrayBuffer resolve.
      const localChunks = chunksRef.current;
      const blob = new Blob(localChunks, { type: mime });
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
    if (!ext) {
      dispatch({ type: 'ERROR', reason: `Unknown recording format: ${s.mimeType}` });
      return;
    }
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

  function removeExisting() {
    props.onChange(null);
    dispatch({ type: 'RESET' });
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={startRecording}>
              ● Re-record
            </button>
            <UploadButton onPick={onFilePicked} label="Replace with upload" />
            <button
              type="button"
              onClick={removeExisting}
              style={{ marginLeft: 'auto', color: 'crimson' }}
            >
              Remove
            </button>
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
