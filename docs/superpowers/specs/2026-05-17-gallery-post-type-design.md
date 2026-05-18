# Gallery Post Type — Design Spec

**Date:** 2026-05-17
**Author:** Nick Cason (via Claude Code brainstorming session)
**Status:** Approved, ready for implementation planning

---

## Goal

Re-introduce a `gallery` post type for multi-image journal entries. Restores the design from commit `eec2eeb` (reverted because of a Tina-specific technical issue, not because of the design itself). Now wired through KeyStatic instead of Tina.

## Why

The reader needs a way to publish multi-photo posts that don't read as one-photo-per-entry. The journal's `photo` type is single-image-only. Without a gallery type, multi-image moments either flood the feed with N adjacent photo entries (loses thematic grouping) or get squeezed into the `essay` body markdown (no carousel UX). The previous attempt established the visual + interaction design; this spec restores that work atop the KeyStatic content layer.

## Out of scope (deferred)

- Drag-to-reorder beyond what KeyStatic's `fields.array` provides natively (it does have reorder handles)
- Per-image alt text as a separate field (use `caption` as alt fallback per the original design)
- EXIF auto-rotation or any image processing pipeline (publish what Nina uploads, as-is)
- Auto-generated thumbnails or responsive `srcset` (single-size original, browser-native lazy load)
- Mass-upload UI (Nina uploads one image at a time via KeyStatic's built-in flow per row)
- Per-image metadata (date taken, location, camera) — could come in v2 with EXIF parsing

---

## Architecture

### Schema layer

Astro schema (`src/content/config.ts`) adds a new discriminated-union variant:

```ts
z.object({
  type: z.literal('gallery'),
  images: z.array(z.object({
    src: z.string(),
    caption: z.string().optional(),
  })).min(1),
  publishedAt: z.coerce.date(),
  threadId: z.string().optional(),
  tags: tagSchema,
  draft: z.boolean().default(false),
}),
```

KeyStatic schema (`keystatic.config.tsx`) mirrors this with a new `images` field on the `posts` collection and a new `'gallery'` option on `postTypeField`:

```ts
images: fields.array(
  fields.object({
    src: fields.image({
      label: '[GALLERY] Image',
      directory: 'public/media',
      publicPath: '/media/',
      validation: { isRequired: true },
    }),
    caption: fields.text({
      label: 'Caption (optional)',
      validation: { isRequired: false },
    }),
  }),
  {
    label: '[GALLERY] Images',
    itemLabel: (props) =>
      props.fields.caption.value || props.fields.src.value || '(image)',
  },
),
```

`itemLabel` makes each row scannable in the KeyStatic admin list view — Nina sees the caption (or filename, or `(image)`) instead of just "Item 1, Item 2, ..."

### Storage layout

Each gallery's images land at `public/media/<post-slug>/<filename>` (KeyStatic's slug-subdir convention for collection-entry assets — same path discipline as the audio recorder field shipped earlier today). Frontmatter `src` values match: `/media/<post-slug>/<filename>`.

A gallery post with five images at slug `velvet-curtains-week` produces:

```
public/media/velvet-curtains-week/
  ├── IMG_2401.jpeg
  ├── IMG_2402.jpeg
  ├── IMG_2403.jpeg
  ├── IMG_2404.jpeg
  └── IMG_2405.jpeg
```

Frontmatter:

```yaml
type: gallery
publishedAt: 2026-05-20T10:00:00Z
images:
  - src: /media/velvet-curtains-week/IMG_2401.jpeg
    caption: Morning light on the velvet, before the cat noticed
  - src: /media/velvet-curtains-week/IMG_2402.jpeg
  - src: /media/velvet-curtains-week/IMG_2403.jpeg
    caption: Same plant, different week
  ...
```

### Component layer

Two new Astro files cherry-picked from commit `eec2eeb` with the same shape they had:

**`src/components/post-types/GalleryCard.astro`** — feed card (~290 lines). Renders:

- Stacked carousel: active image centered; prev/next slides peek behind at reduced scale + opacity + slight `rotateY` for depth
- Arrow buttons (always present), dots indicator (`aria-selected` on active), horizontal swipe (40px threshold, ignored if vertical scroll dominates)
- Caption beneath the carousel that swaps with the active slide
- Each `<img>` carries `data-photo-lightbox` + `data-lightbox-caption` so the existing `PhotoLightbox` picks them up via its `rescan()` call. Lightbox arrow nav cycles through them automatically.
- Single-image galleries collapse to a plain photo render (no nav chrome, identical to `PhotoCard`)
- `prefers-reduced-motion`: side cards hidden behind active (no rotateY animation)

**`src/components/post-permalinks/GalleryPage.astro`** — permalink view (~145 lines). Same carousel structure at a larger size (max-width 1100px, taller stage). Reuses the same `data-gallery-carousel` hook so the binding script handles both card + permalink instances on the page with one pass.

### Integration points

Five existing files gain a `'gallery'` switch case:

- `src/pages/index.astro` — feed renderer (`<GalleryCard />`)
- `src/pages/journal/[...slug].astro` — permalink router (`<GalleryPage />`)
- `src/pages/journal/tag/[tag].astro` — tag pages (`<GalleryCard />`)
- `src/pages/og/[...slug].png.ts` — OG image generation (title = first caption, or `'Gallery · ${N} photos'` if no captions)
- `src/pages/rss.xml.ts` — RSS feed (first image as enclosure, captions concatenated as description)

---

## Data flow

```
[Nina opens a new post in KeyStatic admin]
   ↓ selects Post type: Gallery
   ↓
KeyStatic renders the schema, including the images array field
   ↓
[Nina clicks "Add Image", uploads, captions, repeats]
   ↓
Each image's binary is staged in KeyStatic's form state with a generated
filename (KeyStatic's fields.image handles this)
   ↓
[Nina clicks Save]
   ↓
KeyStatic commits to GitHub: one commit containing the markdown frontmatter
+ all the new image binaries under public/media/<slug>/
   ↓
Cloudflare Pages deploy triggered
   ↓
astro build emits prerendered HTML for the feed, the gallery permalink,
the tag pages, the OG image, the RSS feed entry
   ↓
Live site:
  - Feed page shows the gallery card with the carousel
  - Click into permalink → larger carousel
  - Click any image → existing PhotoLightbox opens; arrows cycle through
    all images in the gallery
```

---

## Error handling

| Scenario | Behavior |
|---|---|
| Gallery post with zero images | Astro schema `.min(1)` rejects at build time. Build fails loud. KeyStatic also surfaces a validation error on save attempt (`validation: { isRequired: true }` on `src`). |
| Image file missing on disk (referenced in frontmatter but not committed) | `<img>` renders broken; carousel still works for other slides. No crash. Manual fix: re-upload. |
| Single-image gallery | Renders as plain photo (no nav chrome). Same UX as a regular `photo` post. |
| `prefers-reduced-motion: reduce` | Side cards hidden behind active (CSS-only fallback). User can still navigate via buttons/swipe/dots. |
| JavaScript disabled | First image visible, nav controls non-functional. Caption + meta + tags still render. Acceptable degraded UX. |
| User uploads non-image file via KeyStatic | `fields.image` blocks at the upload step (accept filter). Not our concern. |
| User uploads 50 images | No limit imposed. Render is still O(N) per carousel — for very large galleries, side-card opacity stack might be visually busy. Soft cap: don't enforce, let Nina decide. |

---

## Testing

### Unit (vitest)
None. The carousel is DOM/touch-event driven, not pure logic. Schema validation is exercised at every Astro build (zod throws if violated).

### Build verification
- `pnpm astro build` must succeed after adding the schema variant + the two components + five switch cases. CI catches regressions.

### Manual smoke (documented in README)
- **Create**: new post → type Gallery → upload 3+ images → caption some → Save. After deploy: confirm carousel renders, arrows/dots/swipe all work, lightbox opens and cycles, captions match active slide.
- **Single-image gallery**: same flow with 1 image. Confirm it renders as plain photo (no carousel chrome).
- **Reduced motion**: in browser settings, enable reduced motion. Reload feed. Confirm side cards are hidden, only active visible, nav still works.
- **Existing post types**: regression check — confirm photo/note/quote/link/audio/essay still render correctly after the switch-case edits.
- **OG image**: navigate to `https://bluestudio.space/og/<gallery-slug>.png` and confirm a PNG renders (title comes from first caption or "Gallery · N photos").

### No Playwright e2e
Same rationale as the audio recorder: KeyStatic admin requires OAuth + live worker, and the carousel involves browser-only interactions (touch, animation timing, intersection of lightbox + scroll) that don't reliably simulate. Manual smoke covers it.

---

## Decision boundary

- Gallery is a discriminated-union variant on the existing `posts` schema, not a separate collection.
- File storage uses KeyStatic's slug-subdir convention (`public/media/<post-slug>/<filename>`).
- Frontmatter `src` values are absolute paths under `/media/<post-slug>/`.
- Component code is a faithful recreation of the original from commit `eec2eeb` — visual + interaction design is finalized.
- Single-image fallback collapses to plain photo render (no nav chrome).
- Existing `PhotoLightbox` handles fullscreen + arrow-nav cycling via `data-photo-lightbox` markers; no new lightbox code.
- No image processing, no thumbnails, no responsive srcset. v1 ships single-size originals.
- No per-image alt text field. Caption serves as alt; missing caption → empty alt (decorative).
- No hard cap on image count.

---

## Files touched

| File | Action |
|---|---|
| `src/content/config.ts` | Modify — add `gallery` variant to `postSchema` discriminated union |
| `keystatic.config.tsx` | Modify — add `'gallery'` to `postTypeField` options; add `images` field to `posts` collection schema |
| `src/components/post-types/GalleryCard.astro` | Create — carousel feed card |
| `src/components/post-permalinks/GalleryPage.astro` | Create — carousel permalink view |
| `src/pages/index.astro` | Modify — add `gallery` switch case |
| `src/pages/journal/[...slug].astro` | Modify — add `gallery` switch case for permalink router |
| `src/pages/journal/tag/[tag].astro` | Modify — add `gallery` switch case for tag pages |
| `src/pages/og/[...slug].png.ts` | Modify — add `gallery` switch case for OG image title selection |
| `src/pages/rss.xml.ts` | Modify — add `gallery` switch case for RSS rendering |
| `README.md` | Modify — append gallery smoke checklist under the Authoring section |

## Files NOT touched

- `src/components/PhotoLightbox.astro` — already handles `data-photo-lightbox` markers and provides arrow-nav cycling. Picks up gallery images automatically via its `rescan()` call.
- `src/components/post-types/PhotoCard.astro` — unchanged; gallery is parallel, not a replacement.
- `src/components/post-permalinks/PhotoPage.astro` — same.
- `src/integrations/waveform.mjs` — gallery is image-only, doesn't interact with the audio pipeline.

---

## Recovery strategy

The reverted commit `eec2eeb` has the full original GalleryCard.astro (~291 lines) and GalleryPage.astro (~143 lines). The implementation plan should:

1. `git show eec2eeb -- src/components/post-types/GalleryCard.astro > src/components/post-types/GalleryCard.astro`
2. `git show eec2eeb -- src/components/post-permalinks/GalleryPage.astro > src/components/post-permalinks/GalleryPage.astro`
3. Inspect both files; adjust any stale assumptions (e.g. if `data-photo-lightbox` API changed, if MetaRow/TagList imports moved). Run `astro check` to surface.

The Tina-specific schema fragment in the reverted commit is irrelevant — KeyStatic schema in `keystatic.config.tsx` is the new source of truth for the admin surface.

---

## Open questions for implementation phase

1. **Lightbox compatibility:** the original commit relied on `PhotoLightbox.rescan()`. Verify that method still exists at the time of implementation and that the `data-photo-lightbox` contract hasn't drifted.
2. **OG image fallback text:** "Gallery · N photos" is the proposed default when no caption exists. If satori's font fallback doesn't include common-case punctuation (·), consider " — " or " - " instead. Decided during implementation.
3. **RSS rendering:** the existing RSS template renders one item per post. For gallery posts, what should the enclosure be — first image, no enclosure, or omit gallery posts from RSS entirely? Default: first image as enclosure, concatenated captions as description.
