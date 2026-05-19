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
 * Build the slug-aware URL prefix that KeyStatic uses for collection-item
 * assets: `<publicPath>/<slug>/` when slug is present, or `<publicPath>/`
 * when it is not (single-entry or top-level asset). Mirrors the behaviour of
 * `getSrcPrefix(publicPath, args.slug)` in the KeyStatic core.
 */
function srcPrefixWithSlug(publicPath: string, slug: string | undefined): string {
  const base = publicPath.replace(/\/*$/, '') + '/';
  return slug ? `${base}${slug}/` : base;
}

/**
 * Strip a known prefix from a stored string. Returns the value untouched if
 * it does not start with the prefix (legacy / external URL).
 */
function stripPrefix(value: string, prefix: string): string {
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
      // Three cases:
      //   1. No value yet: existingValueString = null
      //   2. Legacy/external value (parse couldn't load an on-disk asset →
      //      data is empty Uint8Array): value.filename holds the original full
      //      URL — use it directly.
      //   3. In-collection asset (parse loaded the binary from disk): the slug
      //      is not available in this prop surface, so we can't reconstruct
      //      the slug-aware fetch URL. Build a blob: URL from the loaded bytes
      //      so the player works without needing the slug.
      //
      // NOTE: the blob URL created in case 3 is not revoked on unmount. The
      // URL is small (one per render of an existing post) and revocation would
      // require a useEffect with a ref — acceptable leak for v1.
      let existingValueString: string | null = null;
      if (props.value) {
        if (props.value.data.length === 0) {
          // Legacy/external — value.filename IS the full URL
          existingValueString = props.value.filename || null;
        } else {
          // In-collection: build blob URL from the loaded asset bytes.
          // Wrap in a fresh Uint8Array to satisfy Blob's BlobPart constraint —
          // KeyStatic types the field value as Uint8Array<ArrayBufferLike> but
          // Blob only accepts Uint8Array<ArrayBuffer>. The copy is trivially
          // small (one audio file, only when an existing post is open).
          const blob = new Blob([new Uint8Array(props.value.data)]);
          existingValueString = URL.createObjectURL(blob);
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
      args: { suggestedFilenamePrefix: string | undefined; slug: string | undefined },
    ): string | undefined {
      if (typeof value !== 'string' || value.length === 0) return undefined;
      const prefix = srcPrefixWithSlug(opts.publicPath, args.slug);
      // Legacy / external URLs (don't start with our publicPath + slug) are
      // not on-disk assets we manage. Returning undefined makes KeyStatic
      // skip both loading them on parse and — critically — deleting them on
      // clear/replace. Otherwise GitHub returns "a path was requested for
      // deletion which does not exist as of commit oid" when the user clears
      // a legacy-pathed audio.
      if (!value.startsWith(prefix)) return undefined;
      return stripPrefix(value, prefix);
    },

    parse(
      value: unknown,
      args: { asset: Uint8Array | undefined; slug: string | undefined },
    ): AssetValue {
      if (value === undefined) return null;
      if (typeof value !== 'string') {
        throw new FieldDataError('audioFile must be a string');
      }
      const stripped = stripPrefix(value, srcPrefixWithSlug(opts.publicPath, args.slug));
      if (args.asset === undefined) {
        // Legacy / external URL: no matching asset on disk in our directory
        // (value doesn't start with publicPath + slug, or file is genuinely
        // missing). Return a descriptor with empty data so the player can still
        // render the URL — the Input component uses value.filename directly.
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
        // Preserve the original frontmatter string (value.filename holds the
        // full legacy URL because parse() didn't strip a non-matching prefix).
        return { value: value.filename, asset: undefined };
      }
      // React component already built the filename via generateAudioFilename().
      // Ignore suggestedFilenamePrefix — the spec requires voice-memo-<ts> form.
      // Mirror fields.file: include the slug in the URL so it matches the path
      // KeyStatic writes to disk (<directory>/<slug>/<filename>).
      const filename = value.filename;
      const url = `${srcPrefixWithSlug(opts.publicPath, args.slug)}${filename}`;
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
