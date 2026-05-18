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
 * Strip publicPath prefix from a stored YAML string to get the on-disk
 * filename. Returns the value untouched if it doesn't start with publicPath
 * (legacy / external URL).
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
      // there's a value, so the player can render an existing recording.
      const filename = props.value?.filename;
      let existingValueString: string | null = null;
      if (filename) {
        if (filename.startsWith('/') || /^https?:\/\//i.test(filename)) {
          // Legacy or external URL — already a full path, use as-is.
          existingValueString = filename;
        } else {
          // In-collection asset — prepend publicPath.
          existingValueString = `${opts.publicPath.replace(/\/*$/, '')}/${filename}`;
        }
      }
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

    /**
     * KeyStatic calls filename() with the raw YAML stored value (the URL
     * string) to determine which file to load from disk as `asset`. The
     * return value is the bare filename relative to `directory`.
     *
     * args.suggestedFilenamePrefix is the slash-joined prop path
     * (e.g. 'content/episodes/my-episode/audioFile') and is passed by the
     * UI when saving — we don't use it since we generate our own filename.
     */
    filename(
      value: unknown,
      _args: { suggestedFilenamePrefix: string | undefined; slug: string | undefined },
    ): string | undefined {
      if (typeof value === 'string' && value.length > 0) {
        return srcPrefixStrip(value, opts.publicPath);
      }
      return undefined;
    },

    parse(
      value: unknown,
      args: { asset: Uint8Array | undefined; slug: string | undefined },
    ): AssetValue {
      if (value === undefined) return null;
      if (typeof value !== 'string') {
        throw new FieldDataError('audioFile must be a string');
      }
      const stripped = srcPrefixStrip(value, opts.publicPath);
      if (args.asset === undefined) {
        // Legacy / external URL: no matching asset on disk in our directory
        // (value doesn't start with publicPath, or file is genuinely missing).
        // Return a descriptor with empty data so the player can still render
        // the URL — we reconstruct it in the Input component.
        return {
          data: new Uint8Array(),
          filename: stripped,
          extension: stripped.match(/\.([^.]+$)/)?.[1] ?? '',
        };
      }
      return {
        data: args.asset,
        filename: stripped,
        extension: stripped.match(/\.([^.]+$)/)?.[1] ?? '',
      };
    },

    validate(value: AssetValue) {
      assertRequired(value, opts.validation, opts.label);
      return value;
    },

    serialize(
      value: AssetValue,
      args: { suggestedFilenamePrefix: string | undefined; slug: string | undefined },
    ) {
      if (value === null) {
        return { value: undefined, asset: undefined };
      }
      if (value.data.length === 0) {
        // Legacy/external value hydrated from disk but user didn't re-record.
        // Preserve the original frontmatter string (value.filename holds the full
        // legacy URL because parse() didn't strip a non-matching publicPath).
        return { value: value.filename, asset: undefined };
      }
      // React component already built the filename via generateAudioFilename().
      // Ignore suggestedFilenamePrefix — the spec requires voice-memo-<ts> form.
      const filename = value.filename;
      const url = `${opts.publicPath.replace(/\/*$/, '')}/${filename}`;
      return {
        value: url,
        asset: { filename, content: value.data },
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
