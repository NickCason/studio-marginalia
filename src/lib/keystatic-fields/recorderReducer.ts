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
