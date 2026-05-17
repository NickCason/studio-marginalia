# KeyStatic Audio Recorder Field — Design Spec

**Date:** 2026-05-17
**Author:** Nick Cason (via Claude Code brainstorming session)
**Status:** Approved, ready for implementation planning

---

## Goal

Replace the plain `fields.file` used for `audioFile` in the Voice Memo post type with a custom KeyStatic field that lets Nina either **record audio directly in the browser** or **upload an existing file**, preview before save, and edit existing recordings without leaving the KeyStatic admin.

## Why

KeyStatic ships a generic file picker for binary uploads. Tina had a richer authoring experience for voice memos (the previous CMS Nina is used to). After migrating off Tina, voice-memo authoring regressed to "pick a file from disk" — which means she has to record on her phone, AirDrop to her Mac, find the file, and upload. The recorder eliminates the entire phone-side detour for short voice memos.

## Out of scope (deferred to v2 or later)

- In-browser transcoding to mp3 (we accept browser-native formats)
- Auto-transcription / speech-to-text
- Audio trimming/editing before save
- Custom waveform visualization in the admin
- Multi-track recording
- Background-tab continued recording

---

## Architecture

### Custom KeyStatic field, asset-shaped

A new `audioRecorder()` constructor returns an object matching KeyStatic's `formKind: 'asset'` contract — the same shape used internally by `fields.file` and `fields.image`. KeyStatic handles all of: serialization to/from disk, git commits, asset routing through publicPath/directory mapping, and form-save lifecycle. We only own the React `Input` component.

This means: no new routes, no separate save buttons, no parallel commit pipeline. Nina clicks KeyStatic's normal "Save" and our recording lands in the same git commit as the rest of her post's frontmatter changes.

### Storage layout

- **Disk:** `public/media/voice-memo-<YYYY-MM-DD-HHMM>.<ext>` where `<ext>` is `webm` on Chromium/Firefox, `mp4` on Safari (whatever `MediaRecorder.mimeType` settles on).
- **Frontmatter:** `audioFile: /media/voice-memo-<YYYY-MM-DD-HHMM>.<ext>`
- **Convention rationale:** `public/media/` matches the existing Tina-uploaded media convention (the existing `florae.md` image, the Darth Maul photo, etc). One media root, all uploads land there. The slug-named filename keeps git diffs human-readable when multiple recordings exist.

### Legacy path support

The existing voice memo post (`05-voice-memo.md`) references `/audio/notes-from-the-build-05-voice-memo.mp3` — a legacy path predating both Tina and KeyStatic. The recorder field treats any value whose prefix doesn't match its configured `publicPath` as an opaque external URL: the player still works (browser fetches the URL), and replacing the file produces a new `/media/...` reference. We do **not** migrate legacy files; the live site's existing dual-path handling continues to serve them.

### Build-time waveform pipeline extension

`src/integrations/waveform.mjs` currently:
1. Scans audio files (in `public/audio/` and/or `public/media/`)
2. Decodes via the `audio-decode` package (mp3-only path today)
3. Computes 32-bucket peaks
4. Writes a sibling `<filename>.waveform.json`

Extension: also scan `.webm` and `.mp4` files, attempt to decode. `audio-decode` v2+ supports OGG/Opus (webm container). For MP4/AAC, use a complementary decoder (e.g. `audio-decode/mp4` if available, or pull `node-web-audio-api` as a fallback). If decode fails for any file, log a warning and skip — `AudioCard.astro` already falls back to flat bars when no waveform JSON exists, so the visual degradation is graceful.

---

## Components

### `src/lib/keystatic-fields/audioRecorder.tsx`

Public API: a function `audioRecorder(opts)` that returns the KeyStatic field object. Signature:

```ts
audioRecorder(opts: {
  label: string;
  description?: string;
  directory: string;        // e.g. 'public/media'
  publicPath: string;       // e.g. '/media/'
  validation?: { isRequired?: boolean };
}): FormField  // matches the formKind: 'asset' contract
```

Internals mirror `fields.file` for `parse`, `serialize`, `filename`, `directory`, `reader`, `validate`, `defaultValue`. The only deviation is the `Input` component — it renders `AudioRecorderInput` instead of the default file picker.

### `src/lib/keystatic-fields/AudioRecorderInput.tsx`

A React component KeyStatic invokes with `FormFieldInputProps<AssetValue>`. Self-contained state machine:

```
States:    idle-empty → recording → recorded → idle-existing → recording → recorded → ...
                ↓                                       ↓
                ↓ (upload click)                       ↓ (replace click)
            uploaded → idle-existing                  ...
                                ↑
                                |
                  error ←———————┘
```

**`idle-empty`** (field has no value):
- Two primary buttons side-by-side: `[● Record]` and `[Upload file]`
- Hint text: "Record up to 5 minutes, or upload an audio file."

**`idle-existing`** (field has a value from a prior save):
- Inline `<audio controls>` element showing the existing recording (browser native controls)
- Below it: `[Re-record]` and `[Replace with upload]` secondary buttons
- Note: "Saving the post will overwrite the existing recording."

**`recording`**:
- Replaces the Record button with `[■ Stop]`
- Elapsed time counter (mm:ss)
- Pulsing red dot indicator
- Auto-stops at 5 minutes (hardcoded cap; out-of-scope to make configurable in v1)

**`recorded`** / **`uploaded`**:
- `<audio controls>` with the new Blob as src (via `URL.createObjectURL`)
- `[Use this recording]` (commits to field state) and `[Discard & try again]`
- Until the user clicks "Use this recording," the field's `value` remains the previous saved value (so navigating away or hitting cancel discards safely)

**`error`**:
- Shows the error reason in plain text
- `[Try again]` button returns to idle

### `keystatic.config.tsx` (modified)

Replace the `audioFile` field declaration in the `posts` collection:

```ts
// Before
audioFile: mediaFile(
  '[VOICE MEMO] Audio file (mp3/m4a)',
  'public/audio',
  '/audio/',
),

// After
audioFile: audioRecorder({
  label: '[VOICE MEMO] Audio file',
  description: 'Record in the browser or upload a file. Saved to /media/.',
  directory: 'public/media',
  publicPath: '/media/',
  validation: { isRequired: false },
}),
```

### `src/integrations/waveform.mjs` (modified)

Extend the file-scanning loop to include `.webm` and `.mp4` extensions in `public/media/`. Wrap decode in try/catch. Use feature detection: try `audio-decode`'s primary decoder first; if it throws an unsupported-format error, try a fallback decoder (chosen during implementation). On total failure, log `[waveform] skipped: <filename> (<reason>)` and continue.

### `src/components/post-types/AudioCard.astro` (no change required)

Already handles the dual-path case (`/audio/<slug>.mp3` legacy + `/media/<file>.<ext>` absolute). Already gracefully degrades to flat bars when waveform JSON is missing. No edits needed.

---

## Data flow

```
[Nina opens audio post in KeyStatic admin]
   ↓
AudioRecorderInput.tsx renders based on field's current value
   ├─ Empty post:    shows [Record] + [Upload]
   └─ Existing post: shows <audio> player + [Re-record] + [Replace]
   ↓
[Nina clicks Record]
   ↓
navigator.mediaDevices.getUserMedia({ audio: true })
   → MediaRecorder(stream, { mimeType: best-available })
   → ondataavailable handler accumulates Blob chunks
   ↓
[Nina clicks Stop, or 5-min auto-stop fires]
   ↓
Blob assembled
   → URL.createObjectURL(blob) → <audio> preview
   ↓
[Nina clicks "Use this recording"]
   ↓
Component calls onChange({ data: Uint8Array(blob), filename, extension })
   → KeyStatic now holds the Blob in form state, not yet committed
   ↓
[Nina clicks KeyStatic's "Save" button on the entry]
   ↓
KeyStatic invokes our field's serialize()
   → returns { value: '/media/voice-memo-<ts>.<ext>',
               asset: { filename: 'voice-memo-<ts>.<ext>', content: Uint8Array } }
   → KeyStatic includes both the frontmatter update AND the binary asset
     in a single GitHub commit
   ↓
GitHub commit lands on main → Cloudflare Pages deploy triggered
   ↓
Build pipeline:
   1. pnpm install
   2. astro build runs
   3. waveform integration scans public/media, finds the new file
   4. Decodes it (or skips with warning on decode failure)
   5. Writes <filename>.waveform.json next to the audio file
   6. Astro emits static prerendered pages
   ↓
Live site:
   AudioCard.astro reads the .waveform.json (or falls back to flat bars)
   → renders the existing polished waveform player
```

---

## Error handling

| Scenario | UX | Recovery |
|---|---|---|
| Mic permission denied | Inline message: "Microphone access was denied. You can still upload a file, or enable the mic in browser settings and refresh." Record button disabled; Upload remains. | User can upload, or grant permission and reload. |
| `MediaRecorder` not supported (very old browser) | Record button hidden entirely. Upload-only mode with a small note: "Your browser doesn't support in-page recording. Upload a file instead." | User uploads from disk. |
| User stops mid-recording then immediately starts again | Old Blob is discarded; new recording starts cleanly. State machine handles via reset on Record press. | N/A |
| Recording exceeds 5-min cap | Auto-stops, transitions to `recorded` state, shows note: "Recording stopped at 5:00 max." | User reviews and either saves or re-records. |
| Save fails (GitHub commit error from KeyStatic) | KeyStatic's own error toast surfaces this. Field state preserved so the user can retry. | Built-in KeyStatic retry. |
| Audio file can't be decoded at build time | `waveform.mjs` logs `[waveform] skipped: <filename>` and continues. No `.waveform.json` written. | `AudioCard.astro` renders flat bars (existing fallback). |
| Existing legacy `/audio/...` value | Field reads the value as an external URL, renders the `<audio>` element with that as `src`, shows Re-record/Replace. Replacing uploads to `/media/...`, leaves legacy file untouched on disk (orphan but harmless). | None needed. |
| User navigates away with an un-saved recording | Browser blob is garbage-collected. KeyStatic shows its standard "Unsaved changes" warning before nav. | User confirms discard or stays. |

---

## Testing

### Unit (vitest)
- **State machine transitions** of `AudioRecorderInput` (pure-logic helper extracted from the component): given current state + event, returns next state. No DOM, no MediaRecorder mocks.
- **Filename generation:** `generateAudioFilename(date: Date, extension: string): string` produces `voice-memo-YYYY-MM-DD-HHMM.ext`.
- **Legacy-path detection:** `isLegacyPath(value: string, publicPath: string): boolean` returns true for `/audio/...` when publicPath is `/media/`, false for `/media/...`.

### Build verification
- `pnpm astro build` must continue to succeed after the waveform pipeline extension. CI catches regressions automatically.

### Manual smoke (documented in README)
- Create a new voice memo post in production admin, record 10 seconds, save. Confirm:
  1. The post commit on `main` includes both the markdown and the audio file
  2. After Cloudflare deploy, the new post appears on the live feed with a working player
- Open the existing legacy voice memo (`/journal/05-voice-memo/`), confirm player still works.
- In admin, re-record that legacy post: confirm new file at `/media/...`, frontmatter updated, live site updates.
- In admin, deny mic permission: confirm Upload-only fallback shows.
- In admin on Safari: confirm `.mp4` recording works end-to-end (different code path than Chrome's `.webm`).

### No Playwright e2e
KeyStatic admin requires OAuth + a live worker, and browser-recorded audio can't be cleanly simulated in headless test runners. Manual smoke is the verification.

---

## Decision boundary

- **Recording UI is custom React inside the KeyStatic admin.** No new top-level Astro routes. No new server endpoints (KeyStatic's existing `/api/keystatic/*` handles all writes).
- **File storage:** `public/media/voice-memo-<YYYY-MM-DD-HHMM>.<ext>`. Deterministic filename derived from `new Date()` at the moment of recording — no dependency on the post's slug (which may not exist yet at record time).
- **Legacy `/audio/...` paths preserved.** Not migrated. Both directories scanned for waveform extraction.
- **Browser-native format** kept as-is on disk. No transcoding step in v1.
- **Build pipeline extension** is purely additive — existing `.mp3` handling in `waveform.mjs` unchanged.
- **No Playwright tests.** Manual smoke documented.
- **5-minute hardcoded cap** on recording length. Configurable cap deferred to v2 if Nina hits the ceiling.

---

## Files touched

| File | Action |
|---|---|
| `src/lib/keystatic-fields/audioRecorder.tsx` | Create — field constructor |
| `src/lib/keystatic-fields/AudioRecorderInput.tsx` | Create — React component + state machine |
| `src/lib/keystatic-fields/filename.ts` | Create — `generateAudioFilename` + `isLegacyPath` helpers |
| `src/lib/keystatic-fields/filename.test.ts` | Create — unit tests for helpers |
| `keystatic.config.tsx` | Modify — replace `audioFile` field declaration |
| `src/integrations/waveform.mjs` | Modify — extend to `.webm`/`.mp4` decoding with graceful fallback |
| `package.json` | Modify — possibly add an extra decoder dep (decided during implementation) |
| `README.md` | Modify — add the manual smoke checklist under Authoring |

## Files NOT touched

- `src/components/post-types/AudioCard.astro` — works with both old and new file paths already
- `src/components/post-permalinks/AudioPage.astro` — same
- `src/content/config.ts` — Astro schema for `audioFile: z.string()` is unchanged
- Existing voice memo posts — frontmatter shape preserved
- `astro.config.mjs` — no new integrations or vite config needed

---

## Open questions for implementation phase

1. **MP4/AAC decoder:** does `audio-decode@2.x` cover MP4 out of the box, or do we need to add a separate decoder package? Answered during implementation when we actually try it.
2. **KeyStatic asset binary format:** the `serialize()` return shape expects `content: Uint8Array`. Confirm this is what KeyStatic v0.5 expects for new asset writes (vs `Blob` or `ArrayBuffer`). Read keystatic-core sources during implementation.
3. **Cleanup of orphan legacy files:** out of scope for this feature, but worth flagging — the legacy `/audio/notes-from-the-build-05-voice-memo.mp3` file stays on disk forever even if Nina re-records the post. A separate cleanup task could detect and prune unreferenced files.
