# Gallery Post Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-introduce a `gallery` post type for multi-image journal entries with a stacked-card carousel, authored through KeyStatic.

**Architecture:** Recovery of the visual + interaction design from reverted commit `eec2eeb`, with the schema layer swapped from Tina to KeyStatic. Two recovered components (`GalleryCard.astro`, `GalleryPage.astro`), one new variant in the Astro `posts` discriminated union, one new `images` array field + `'gallery'` option in `keystatic.config.tsx`, and five `'gallery'` switch-cases in the existing integration files (feed, permalink router, tag pages, OG image, RSS).

**Tech Stack:** Astro 5 content collections (Zod discriminated union), KeyStatic 0.5 (`fields.array(fields.object({src: fields.image, caption: fields.text}))`), existing `PhotoLightbox` (no changes needed — it picks up `data-photo-lightbox` markers via `rescan()`).

**Spec:** `docs/superpowers/specs/2026-05-17-gallery-post-type-design.md` is the authoritative requirements doc. Read it before starting if any task description feels ambiguous.

**Starting state:** `main` at commit `7bc8201` (the spec commit). The audio recorder feature shipped earlier today (commits up through `a2ba096`) is live in production. No gallery post type exists yet; the schema change in Task 1 is the first new thing.

---

## File Structure

**Created in this plan:**
- `src/components/post-types/GalleryCard.astro` — feed card (carousel), recovered from `eec2eeb`
- `src/components/post-permalinks/GalleryPage.astro` — permalink view (larger carousel), recovered from `eec2eeb`

**Modified:**
- `src/content/config.ts` — add `gallery` variant to `postSchema`
- `keystatic.config.tsx` — add `'gallery'` to `postTypeField` options; add `images` field to `posts` collection schema
- `src/pages/index.astro` — feed switch-case
- `src/pages/journal/[...slug].astro` — permalink router switch-case (TWO sites: title switch + JSX type-check)
- `src/pages/journal/tag/[tag].astro` — tag page switch-case
- `src/pages/og/[...slug].png.ts` — OG image title selection
- `src/pages/rss.xml.ts` — RSS rendering switch-case
- `README.md` — append gallery smoke checklist

**Untouched (intentional):**
- `src/components/PhotoLightbox.astro` — already handles `data-photo-lightbox` markers and arrow-nav cycling via `rescan()`. Picks up gallery images for free.
- `src/components/post-types/PhotoCard.astro`, `src/components/post-permalinks/PhotoPage.astro` — unchanged; gallery is parallel, not a replacement.
- `src/integrations/waveform.mjs` — image-only feature, no audio interaction.

---

## Task 1: Schema additions (Astro + KeyStatic)

**Files:**
- Modify: `src/content/config.ts`
- Modify: `keystatic.config.tsx`

The schema layer for both the build-time content validator (Astro/Zod) and the admin UI (KeyStatic) gets the gallery variant. Doing both in one commit so the schemas stay in sync.

- [ ] **Step 1: Add gallery variant to the Astro Zod discriminated union**

Open `src/content/config.ts`. Find the `audio` variant inside `postSchema` (around line 52, the last variant in the union). Insert a new gallery variant BEFORE it:

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

- [ ] **Step 2: Add `'gallery'` to KeyStatic's post-type select**

Open `keystatic.config.tsx`. Find `postTypeField` (a `fields.select`, around line 21). In its `options` array, add a new option after `'Photo'` and before `'Voice memo'`:

```ts
    { label: 'Gallery (multi-photo)', value: 'gallery' },
```

The full options array after edit:

```ts
  options: [
    { label: 'Essay (longform)', value: 'essay' },
    { label: 'Note (one paragraph)', value: 'note' },
    { label: 'Quote', value: 'quote' },
    { label: 'Link', value: 'link' },
    { label: 'Photo', value: 'photo' },
    { label: 'Gallery (multi-photo)', value: 'gallery' },
    { label: 'Voice memo', value: 'audio' },
  ],
```

- [ ] **Step 3: Add the `images` field to the posts collection schema**

Still in `keystatic.config.tsx`. Find the posts collection's schema (around line 61). Add a new `images` field. Insert it AFTER the `caption` field (which is in the photo-fields cluster, around line 109) and BEFORE the `audioFile` field. Code:

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

- [ ] **Step 4: Verify the build succeeds**

Run:

```bash
~/.local/bin/pnpm astro build 2>&1 | tail -15
```

Expected: build completes. Both schemas compile. KeyStatic admin bundle picks up the new field. (No gallery posts exist yet, so the build's prerendered pages don't change.)

Also:

```bash
~/.local/bin/pnpm exec astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/content/config.ts keystatic.config.tsx
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(gallery): add gallery variant to Astro + KeyStatic schemas"
```

---

## Task 2: Recover GalleryCard.astro from reverted commit

**Files:**
- Create: `src/components/post-types/GalleryCard.astro`

The original GalleryCard (~291 lines) lives in commit `eec2eeb`. Recover it verbatim; the visual + interaction design was already approved when it shipped before.

- [ ] **Step 1: Recover the file**

Run:

```bash
git show eec2eeb:src/components/post-types/GalleryCard.astro > src/components/post-types/GalleryCard.astro
```

Verify size:

```bash
wc -l src/components/post-types/GalleryCard.astro
```

Expected: 291 lines.

- [ ] **Step 2: Inspect for drifted dependencies**

Read the first 12 lines (the frontmatter `---` block) and confirm:

- `import type { CollectionEntry } from 'astro:content';` — still valid
- `import MetaRow from '~/components/ui/MetaRow.astro';` — verify `MetaRow.astro` still exists
- `import TagList from '~/components/ui/TagList.astro';` — verify `TagList.astro` still exists
- `import { formatDate } from '~/lib/formatDate';` — verify `formatDate` is still exported

Run:

```bash
ls src/components/ui/MetaRow.astro src/components/ui/TagList.astro src/lib/formatDate.ts 2>&1
```

Expected: all three exist. If any are renamed/moved, the file's imports need updating — but report back as DONE_WITH_CONCERNS describing which import failed, don't auto-fix.

- [ ] **Step 3: Run astro check to catch any type drift**

Run:

```bash
~/.local/bin/pnpm exec astro check 2>&1 | grep -E "GalleryCard|error|warning" | head -20
```

Expected: no errors mentioning GalleryCard.astro. (Other unrelated hints in the codebase are not your concern.) If GalleryCard-specific errors appear:
- "Property 'images' does not exist on type" → Task 1's schema change didn't take effect; verify Task 1 was committed and the type-narrowing in the component's `if (post.data.type !== 'gallery') throw` is honored.
- Missing import → fix the import path; if a renamed dependency, report DONE_WITH_CONCERNS.

- [ ] **Step 4: Run the build to confirm it compiles into the bundle**

Run:

```bash
~/.local/bin/pnpm astro build 2>&1 | tail -10
```

Expected: build succeeds. (No gallery posts yet, so no permalinks are generated using this component.)

- [ ] **Step 5: Commit**

```bash
git add src/components/post-types/GalleryCard.astro
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(gallery): recover GalleryCard.astro from reverted commit eec2eeb"
```

---

## Task 3: Recover GalleryPage.astro from reverted commit

**Files:**
- Create: `src/components/post-permalinks/GalleryPage.astro`

Same pattern as Task 2 but for the permalink view (~143 lines).

- [ ] **Step 1: Recover the file**

```bash
git show eec2eeb:src/components/post-permalinks/GalleryPage.astro > src/components/post-permalinks/GalleryPage.astro
```

Verify:

```bash
wc -l src/components/post-permalinks/GalleryPage.astro
```

Expected: 143 lines.

- [ ] **Step 2: Inspect for drifted dependencies**

Read the frontmatter `---` block. Likely imports: `CollectionEntry` from `astro:content`, plus whatever helpers/components the original used. Confirm each import resolves.

```bash
head -12 src/components/post-permalinks/GalleryPage.astro
```

If any import points to a file that no longer exists, report DONE_WITH_CONCERNS with the specific path.

- [ ] **Step 3: astro check**

```bash
~/.local/bin/pnpm exec astro check 2>&1 | grep -E "GalleryPage|error|warning" | head -20
```

Expected: no errors mentioning GalleryPage.astro.

- [ ] **Step 4: Build**

```bash
~/.local/bin/pnpm astro build 2>&1 | tail -10
```

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/post-permalinks/GalleryPage.astro
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(gallery): recover GalleryPage.astro from reverted commit eec2eeb"
```

---

## Task 4: Wire integration switch-cases (5 files)

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/journal/[...slug].astro`
- Modify: `src/pages/journal/tag/[tag].astro`
- Modify: `src/pages/og/[...slug].png.ts`
- Modify: `src/pages/rss.xml.ts`

Each of these has a switch or conditional that fans out by `post.data.type`. Add a `gallery` arm to each. The exact edits are taken from the reverted commit's diff (lines starting with `+` that reference gallery), pre-verified against the current files.

- [ ] **Step 1: Add the imports**

Open `src/pages/index.astro`. Near the top, find the existing post-type-card imports (around line 12). Add `GalleryCard`:

```diff
 import PhotoCard from '~/components/post-types/PhotoCard.astro';
+import GalleryCard from '~/components/post-types/GalleryCard.astro';
 import AudioCard from '~/components/post-types/AudioCard.astro';
```

Open `src/pages/journal/[...slug].astro`. Add `GalleryPage` to the permalink imports (the file imports `EssayPage`, `NotePage`, etc.):

```diff
 import PhotoPage from '~/components/post-permalinks/PhotoPage.astro';
+import GalleryPage from '~/components/post-permalinks/GalleryPage.astro';
 import AudioPage from '~/components/post-permalinks/AudioPage.astro';
```

Open `src/pages/journal/tag/[tag].astro`. Same pattern — add `GalleryCard` to the post-type-card imports:

```diff
 import PhotoCard from '~/components/post-types/PhotoCard.astro';
+import GalleryCard from '~/components/post-types/GalleryCard.astro';
 import AudioCard from '~/components/post-types/AudioCard.astro';
```

(`src/pages/og/[...slug].png.ts` and `src/pages/rss.xml.ts` don't import the components — they branch on `post.data.type` for plain-text title selection. No import edits there.)

- [ ] **Step 2: Add the `gallery` switch case to the feed (`src/pages/index.astro`)**

Find the switch on `post.data.type` (around line 29, the line that contains `case 'audio': return <AudioCard ...`). Insert immediately ABOVE the audio case:

```diff
+              case 'gallery': return <GalleryCard post={post} />;
               case 'audio': return <AudioCard post={post} />;
```

- [ ] **Step 3: Add the `gallery` case to the permalink router (`src/pages/journal/[...slug].astro`) — TWO sites**

This file has two places that branch on type:

**Site 3a — title selection** (around line 25, in the switch statement that sets the `<title>` string):

```diff
+  case 'gallery': {
+    const firstCap = post.data.images[0]?.caption;
+    title = firstCap ? `${firstCap} — Blue Studio` : `Gallery — Blue Studio`;
+    description = firstCap;
+    break;
+  }
   case 'audio': title = `${post.data.title} — Blue Studio`; description = post.data.transcript?.slice(0, 160); break;
```

**Site 3b — JSX type-check fan-out** (around line 39, the lines that conditionally render each post-type permalink):

```diff
+    {post.data.type === 'gallery' && <GalleryPage post={post} />}
     {post.data.type === 'audio' && <AudioPage post={post} />}
```

- [ ] **Step 4: Add the `gallery` case to tag pages (`src/pages/journal/tag/[tag].astro`)**

Around line 55, mirror Site 2 of `index.astro`:

```diff
+          case 'gallery': return <GalleryCard post={post} />;
           case 'audio': return <AudioCard post={post} />;
```

- [ ] **Step 5: Add the `gallery` case to OG image (`src/pages/og/[...slug].png.ts`)**

Around line 38-45, find the title-selection switch. Add a gallery arm. Per the reverted commit:

```diff
     case 'photo': title = post.data.caption ?? 'Photo'; break;
+    case 'gallery': title = post.data.images[0]?.caption ?? `Gallery · ${post.data.images.length} photos`; break;
     default:      title = 'Blue Studio';
```

- [ ] **Step 6: Add the `gallery` case to RSS (`src/pages/rss.xml.ts`)**

Around line 23, find the per-type switch building `title`/`description`. Add gallery:

```diff
+        case 'gallery': title = `Gallery (${data.images.length} photos)`; description = data.images[0]?.caption ?? ''; break;
         case 'audio': title = `Voice memo: ${data.title}`; description = data.transcript ?? p.body; break;
```

- [ ] **Step 7: Run astro check + build**

```bash
~/.local/bin/pnpm exec astro check 2>&1 | tail -10
~/.local/bin/pnpm astro build 2>&1 | tail -15
```

Expected: 0 errors. Build completes. (Still no gallery posts in the content, so no new pages are emitted; just verifying no regression in the existing post types.)

- [ ] **Step 8: Commit**

```bash
git add src/pages/index.astro src/pages/journal/\[...slug\].astro \
  src/pages/journal/tag/\[tag\].astro src/pages/og/\[...slug\].png.ts \
  src/pages/rss.xml.ts
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "feat(gallery): wire gallery switch cases (feed/permalink/tag/og/rss)"
```

---

## Task 5: README smoke checklist

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append the gallery smoke checklist**

Open `README.md`. Find the `### Voice memo smoke checklist` subsection (added in the audio recorder shipping). After it (and before the next `##` heading), append:

```markdown
### Gallery smoke checklist (after deploys that touch the gallery)

Run these manually on `bluestudio.space/keystatic/` after any change to
the gallery components, schema, or KeyStatic admin schema for the
gallery post type:

1. **Create a multi-image gallery**: New post → type Gallery → add 3+
   images via the Images array → caption a couple → Save. After the
   Cloudflare deploy completes, confirm:
   - Feed shows the stacked carousel with active image centered and
     side images peeking behind
   - Arrow buttons, dot indicator, and horizontal swipe all cycle slides
   - Tap an image → existing PhotoLightbox opens; lightbox arrows cycle
     through all gallery images
   - Caption beneath the carousel swaps with the active slide
2. **Single-image gallery**: same flow with one image. Confirm it renders
   as a plain photo (no nav chrome) — identical UX to a photo post.
3. **Permalink**: click the gallery card → confirm the permalink view
   renders the same carousel at a larger size.
4. **Reduced motion**: in browser settings, enable "Reduce motion".
   Reload feed. Confirm side cards are hidden, only active image visible,
   nav still works via buttons / dots / swipe.
5. **Existing post types**: regression check — confirm photo, note,
   quote, link, audio, essay still render correctly.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git commit -m "docs(readme): gallery smoke checklist"
```

---

## Task 6: Merge to main + verify deploy

**Files:** None modified. Git merge + deploy watch.

Pushing directly to main per the established workflow (audio recorder shipped the same way). If you ran this work on a feature branch, merge with `--no-ff` first; otherwise push directly.

- [ ] **Step 1: Confirm everything compiles one last time**

```bash
~/.local/bin/pnpm exec astro check 2>&1 | tail -5
~/.local/bin/pnpm astro build 2>&1 | tail -15
```

Expected: 0 errors, build succeeds.

- [ ] **Step 2: Push to main**

If on feature branch (recommended):

```bash
git checkout main
GIT_AUTHOR_NAME="Nick Cason" GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  GIT_COMMITTER_NAME="Nick Cason" GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
  git merge --no-ff feature/gallery -m "feat: gallery post type with stacked-card carousel"
git push origin main
```

If directly on main:

```bash
git push origin main
```

- [ ] **Step 3: Watch the deploy**

```bash
sleep 8
gh run list --repo NickCason/blue-studio --workflow "Build & deploy to Cloudflare Pages" --limit 1 --json databaseId -q '.[0].databaseId'
```

Take the printed run id and watch:

```bash
gh run watch <run-id> --repo NickCason/blue-studio --exit-status --interval 10
gh run view <run-id> --repo NickCason/blue-studio --json conclusion -q .conclusion
```

Expected: success.

- [ ] **Step 4: Smoke-test endpoints**

```bash
echo "=== Public site ===" && curl -sI -o /dev/null -w "%{http_code}\n" https://bluestudio.space/
echo "=== KeyStatic admin ===" && curl -sI -o /dev/null -w "%{http_code}\n" https://bluestudio.space/keystatic/
echo "=== Voice memo (regression check) ===" && curl -sI -o /dev/null -w "%{http_code}\n" https://bluestudio.space/journal/05-voice-memo/
```

Expected: all 200.

- [ ] **Step 5: Hand off to user for manual smoke**

Print Task 5's smoke checklist content and ask the user to:
1. Open `bluestudio.space/keystatic/`
2. Create a test gallery with 3-4 photos
3. Save → wait for redeploy → verify the carousel works on the live feed
4. Optionally: delete the test gallery post afterward

The carousel UX has to be tried, not just probed — there's no curl-equivalent for "swipe, see depth animation, lightbox cycling." Hand-off is expected.

---

## Notes for the executing agent

**Project memory — read before starting:**
- `feedback-cache-is-system-problem.md` — never tell the user to hard-refresh.
- `feedback-tina-lock-must-be-committed.md` — context only; Tina is gone from the repo.

**Git identity:** set per-commit via env vars (see commit commands). Do NOT modify `~/.gitconfig`.

**pnpm:** lives at `~/.local/bin/pnpm`.

**Don't over-engineer:** the gallery design is finalized (per the spec). Don't introduce thumbnails, responsive srcset, or auto-EXIF on your own. Those are explicitly v2.

**If `astro check` after Task 2 or 3 surfaces an error about a stale dependency** in the recovered file (e.g. `formatDate` was renamed, or `MetaRow` moved), report it as DONE_WITH_CONCERNS with the exact error text and the import line that failed — don't refactor the recovered file unilaterally. The controller will decide whether to patch in place or fall back.

**If the schema variant added in Task 1 doesn't take effect** in time for Task 2's `astro check`: re-run `pnpm install` (regenerates `.astro/types` cache) then re-check. Astro 5 sometimes lags on type regeneration when only `src/content/config.ts` changes.

**Two-site edit in Task 4 Step 3** is the most error-prone part of this plan. Make sure both the title switch AND the JSX type-check fan-out get the gallery arm. Run `grep -n "gallery" src/pages/journal/\[...slug\].astro` after editing — expected output: at least 2 lines.

**Working directory:** `/home/nick/blue-studio`. Start on a feature branch if not already on one: `git checkout -b feature/gallery` (parent should be main at `7bc8201` or later).
