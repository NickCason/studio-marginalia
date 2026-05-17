# KeyStatic Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tina Cloud with KeyStatic for content editing on blue-studio, eliminating the recurring Tina schema/auth failures that have blocked Nina (the editor) multiple times.

**Architecture:** KeyStatic admin lives at `/keystatic/*` as SSR routes on Cloudflare Pages (Astro switched to `output: 'server'` with `@astrojs/cloudflare`). Every existing public route opts back into prerender via `export const prerender = true;` so the reader-facing site stays fully static. Auth uses GitHub OAuth (Nina logs in with her GitHub account). Content stays in `src/content/posts/**/*.md` — file paths and Astro content schema are unchanged so existing URLs and 12+ rendering files don't need modification.

**Tech Stack:** `@keystatic/core`, `@keystatic/astro`, `@astrojs/cloudflare`, `@astrojs/react`, `react@^18`, `react-dom@^18`. Repo storage (no external DB).

**Schema decision — flat frontmatter, no `fields.conditional`:** KeyStatic's `fields.conditional` writes nested frontmatter like `type: { discriminant: 'essay', value: { title, ... } }`, which would break the existing Zod discriminated union in `src/content/config.ts` and require changes to every file that reads `post.data.type` (12+ files) and a migration of every existing post. The flat schema mirrors what Tina was already producing — same frontmatter shape, same Astro schema, no rendering changes. Trade-off: same UX limitation as Tina, where all fields are visible regardless of selected post type (mitigated by `[TYPE]`-prefixed labels). Proper field gating is a v2 enhancement after the migration is verified stable.

**Why this matters (don't skip):** Tina Cloud has burned the user multiple times — see git log for the pattern: `33011f9`, `98cb406`, `f586cf4`, `7d22c3b`, `4daec85`, `74aff76`, `9a00111`. Today's incident lost Nina's account at the Cloud platform level after a `tina-lock.json` regeneration. The user explicitly chose KeyStatic to be done with Cloud entirely. **Do not introduce any new external CMS service dependencies during this migration.**

**Starting state:** This plan picks up from branch `migrate/keystatic` at commit `09f14e6` (`wip(keystatic): scaffold migration — install deps, switch Astro to server mode`). That commit already:
- Installed `@keystatic/core@^0.5`, `@keystatic/astro@^5`, `@astrojs/cloudflare`, `@astrojs/react`, `react@^18`, `react-dom@^18` (via `pnpm`).
- Rewrote `astro.config.mjs` to `output: 'server'` + `adapter: cloudflare({ imageService: 'passthrough' })` + integrations `[sitemap(), waveformIntegration(), react(), keystatic()]`.
- Added `export const prerender = true;` to all 9 existing routes (`src/pages/{404,about,index}.astro`, `src/pages/journal/{[...slug],tag/[tag]}.astro`, `src/pages/og/[...slug].png.ts`, `src/pages/rss.xml.ts`, `src/pages/work/{index,portfolio/index,portfolio/[slug]}.astro`).
- **Has NOT been built or tested.** Task 1 verifies the foundation.

Tina (`tina/`, `tinacms` and `@tinacms/cli` deps, `notify-tina.yml` workflow, Tina build step in `deploy.yml`) is still present and will be removed in the final cutover task — not earlier, so we have a fallback if KeyStatic doesn't pan out.

---

## File Structure

**Created in this migration:**
- `keystatic.config.tsx` — KeyStatic schema mirroring `tina/config.ts`. Top-level (root of repo), TSX because schemas can use JSX for field components.
- `src/pages/keystatic/[...params].astro` — admin UI entry route. SSR (not prerendered).
- `src/pages/api/keystatic/[...params].ts` — OAuth + content-write handlers wired to `@keystatic/astro/api`. SSR (not prerendered).

**Modified:**
- `astro.config.mjs` — already modified in starting commit, may need fixes after Task 1 verification.
- Routes that get prerender opt-in — already done in starting commit.
- `.github/workflows/deploy.yml` — drop Tina build step in Task 8.
- `package.json` — drop Tina deps in Task 8.
- `README.md`, `CLAUDE.md` (if exists) — drop Tina references in Task 8.

**Deleted in Task 8:**
- `tina/` directory (entire).
- `.github/workflows/notify-tina.yml`.

**Untouched (intentional):**
- `src/content/config.ts` — Astro discriminated union stays as-is, KeyStatic schema matches its shape.
- `src/content/posts/**/*.md` — existing posts untouched.
- `src/components/post-types/*`, `src/components/post-permalinks/*`, `src/pages/journal/[...slug].astro` — every file that reads `post.data.type` stays the same.
- `functions/api/deploy-status.ts` — Cloudflare Pages Function stays as a raw function (not an Astro route). Reuse for KeyStatic admin's deploy banner if we port it.

---

## Task 1: Verify the WIP foundation builds

**Files:** No new files. Verifies the existing branch state compiles.

- [ ] **Step 1: Confirm branch + HEAD**

```bash
cd /home/nick/blue-studio
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Expected: branch is `migrate/keystatic`, HEAD is `09f14e6` (or a later commit if you've already done some work). If not on this branch:

```bash
git checkout migrate/keystatic
```

- [ ] **Step 2: Verify dependencies are installed**

```bash
ls node_modules/@keystatic/astro/package.json node_modules/@astrojs/cloudflare/package.json node_modules/react/package.json
```

Expected: all three exist. If any are missing:

```bash
# pnpm is installed at ~/.local/bin/pnpm on this machine (via corepack)
~/.local/bin/pnpm install
```

- [ ] **Step 3: Run the build**

```bash
~/.local/bin/pnpm astro build 2>&1 | tail -60
```

Expected outcomes vary — capture the FULL output and analyze. Likely issues:
- **"Missing keystatic.config" or similar** — expected, Task 2 fixes this. Skip ahead.
- **"adapter X does not support Y"** — capture exact text. Most likely `imageService: 'passthrough'` syntax or `sharp`/`compileEdgeFunction` complaint. Fix per Astro 5 + cloudflare adapter docs.
- **TypeScript error about prerender** — capture text. Some Astro versions need prerender outside the `---` block for `.astro` pages; if so, move the export to the `<script>` block.
- **"react integration not found"** — verify `@astrojs/react` is in deps.

- [ ] **Step 4: If errors found, fix them**

For each error, the fix is determined by the error text. Common fixes:
- adapter config: replace `cloudflare({ imageService: 'passthrough' })` with plain `cloudflare()` if 'passthrough' is invalid in the installed version.
- waveform integration: check `src/integrations/waveform.mjs` for any `import.meta.glob` or other build-time hooks that may behave differently in server mode. If yes, the integration likely just needs `prerender: true` added to its emitted pages (but it doesn't emit pages — it processes audio files at build time, so should be unaffected).

- [ ] **Step 5: Re-run until clean (no errors, build completes)**

Expected output ends with something like:
```
[build] 9 page(s) built in <Xms>
[build] Complete!
```

The build will produce a `dist/` directory with a `_worker.js` (Cloudflare Workers SSR bundle) and prerendered HTML for all the routes that opted into prerender.

- [ ] **Step 6: Commit any fixes**

If you made fixes, commit them:

```bash
git add -A
git diff --cached  # review changes
git commit -m "fix(keystatic-wip): build foundation cleanly under server mode"
```

If no fixes were needed, skip this step.

---

## Task 2: Write `keystatic.config.tsx` (flat schema)

**Files:**
- Create: `keystatic.config.tsx` (project root)

This is the entire CMS schema. It mirrors `tina/config.ts` but as KeyStatic config. The two key constraints:

1. **Flat frontmatter** (see "Schema decision" in plan header). Do not use `fields.conditional`.
2. **Field names match Astro's Zod schema in `src/content/config.ts`**. If KeyStatic writes a field with a different name, Astro will fail to validate it.

Field-name map from Tina → Astro Zod schema (read `src/content/config.ts` if you need to confirm):
- All post types: `type` (literal), `publishedAt`, `tags`, `draft`, `threadId`
- Essay: `title`, `dek`, `image` (heroImage was removed in commit `69715d0` — do NOT add it back)
- Note: just the shared fields
- Quote: `source`, `sourceUrl`
- Link: `url`, `title`, `source`, `ogImage`
- Photo: `image`, `caption`
- Audio: `title`, `audioFile`, `duration`, `context`, `transcript`

Existing posts use these exact field names already. Mismatches will surface in Task 4's local-storage test (Astro `pnpm astro build` will reject content).

- [ ] **Step 1: Create `keystatic.config.tsx`**

```tsx
import { config, collection, singleton, fields } from '@keystatic/core';

const mediaImage = (label: string, description?: string) =>
  fields.image({
    label,
    description,
    directory: 'public/media',
    publicPath: '/media/',
    validation: { isRequired: false },
  });

const mediaFile = (label: string, directory: string, publicPath: string) =>
  fields.file({
    label,
    directory,
    publicPath,
    validation: { isRequired: false },
  });

const postTypeField = fields.select({
  label: 'Post type',
  description:
    'Pick the type FIRST. Then fill in fields tagged with that type — others will be ignored by the build.',
  options: [
    { label: 'Essay (longform)', value: 'essay' },
    { label: 'Note (one paragraph)', value: 'note' },
    { label: 'Quote', value: 'quote' },
    { label: 'Link', value: 'link' },
    { label: 'Photo', value: 'photo' },
    { label: 'Voice memo', value: 'audio' },
  ],
  defaultValue: 'note',
});

export default config({
  storage:
    process.env.KEYSTATIC_STORAGE === 'local'
      ? { kind: 'local' }
      : {
          kind: 'github',
          repo: { owner: 'NickCason', name: 'blue-studio' },
        },

  ui: {
    brand: { name: 'Blue Studio' },
    navigation: {
      Content: ['posts', 'portfolio', 'noticing'],
      'Site state': ['now', 'site', 'aboutPage'],
    },
  },

  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'slug',
      path: 'src/content/posts/**',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['type', 'publishedAt'],
      schema: {
        slug: fields.slug({
          name: { label: 'Filename slug', description: 'URL-safe; becomes /journal/<slug>/' },
        }),
        type: postTypeField,
        publishedAt: fields.datetime({ label: 'Published at' }),
        draft: fields.checkbox({ label: 'Draft (hide from feed)', defaultValue: false }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (props) => props.value,
        }),
        threadId: fields.text({
          label: 'Thread ID (optional, e.g. notes-from-the-build)',
          validation: { isRequired: false },
        }),

        // -- Shared by essay / link / voice memo --
        title: fields.text({
          label: '[ESSAY · LINK · VOICE MEMO] Title',
          validation: { isRequired: false },
        }),

        // -- Essay --
        dek: fields.text({
          label: '[ESSAY] Dek (subtitle)',
          multiline: true,
          validation: { isRequired: false },
        }),

        // -- Photo (required) + Essay hero (optional) --
        image: mediaImage('[PHOTO required · ESSAY optional] Image'),

        // -- Quote + Link --
        source: fields.text({
          label: '[QUOTE · LINK] Source',
          validation: { isRequired: false },
        }),
        sourceUrl: fields.url({
          label: '[QUOTE] Source URL (optional)',
          validation: { isRequired: false },
        }),

        // -- Link --
        url: fields.url({
          label: '[LINK] URL',
          validation: { isRequired: false },
        }),
        ogImage: mediaImage('[LINK] OG image (optional)'),

        // -- Photo --
        caption: fields.text({
          label: '[PHOTO] Caption',
          multiline: true,
          validation: { isRequired: false },
        }),

        // -- Voice memo --
        audioFile: mediaFile(
          '[VOICE MEMO] Audio file (mp3/m4a)',
          'public/audio',
          '/audio/',
        ),
        duration: fields.text({
          label: '[VOICE MEMO] Duration mm:ss',
          validation: { isRequired: false },
        }),
        context: fields.text({
          label: '[VOICE MEMO] Context line (e.g. "in the car")',
          validation: { isRequired: false },
        }),
        transcript: fields.text({
          label: '[VOICE MEMO] Transcript',
          multiline: true,
          validation: { isRequired: false },
        }),

        // -- Body (post body, markdown) --
        body: fields.markdoc({ label: 'Body' }),
      },
    }),

    portfolio: collection({
      label: 'Portfolio',
      slugField: 'slug',
      path: 'src/content/portfolio/**',
      format: { contentField: 'body' },
      schema: {
        slug: fields.slug({ name: { label: 'Filename slug' } }),
        name: fields.text({ label: 'Client name' }),
        year: fields.integer({ label: 'Year' }),
        serviceCategory: fields.text({
          label: 'Service category',
          validation: { isRequired: false },
        }),
        pitch: fields.text({ label: 'One-line pitch' }),
        image: mediaImage('Card image (optional)'),
        externalUrl: fields.url({
          label: 'External link (optional)',
          validation: { isRequired: false },
        }),
        order: fields.integer({ label: 'Display order (lower = earlier)', defaultValue: 0 }),
        body: fields.markdoc({ label: 'Body' }),
      },
    }),

    noticing: collection({
      label: 'Noticing',
      slugField: 'slug',
      path: 'src/content/noticing/**',
      format: 'json',
      schema: {
        slug: fields.slug({ name: { label: 'Filename slug' } }),
        quote: fields.text({ label: 'Quote / observation' }),
        source: fields.text({ label: 'Source / context' }),
        publishedAt: fields.datetime({ label: 'Date' }),
      },
    }),
  },

  singletons: {
    now: singleton({
      label: 'On her desk (now)',
      path: 'src/content/now/now',
      format: 'json',
      schema: {
        reading: fields.object(
          {
            title: fields.text({ label: 'Title', validation: { isRequired: false } }),
            author: fields.text({ label: 'Author', validation: { isRequired: false } }),
          },
          { label: 'Reading' },
        ),
        brewing: fields.text({
          label: 'Brewing',
          multiline: true,
          validation: { isRequired: false },
        }),
        listening: fields.object(
          {
            title: fields.text({ label: 'Title', validation: { isRequired: false } }),
            artist: fields.text({ label: 'Artist', validation: { isRequired: false } }),
          },
          { label: 'Listening' },
        ),
      },
    }),

    site: singleton({
      label: 'Site config',
      path: 'src/content/site/site',
      format: 'json',
      schema: {
        issueNumber: fields.integer({ label: 'Issue number' }),
        season: fields.text({ label: 'Season (Spring/Summer/Fall/Winter)' }),
        year: fields.text({ label: 'Year label (e.g. "year one")' }),
        tagline: fields.text({ label: 'Tagline (optional)', validation: { isRequired: false } }),
      },
    }),

    aboutPage: singleton({
      label: 'About page',
      path: 'src/content/pages/about',
      format: { contentField: 'body' },
      schema: {
        title: fields.text({ label: 'Page title' }),
        dek: fields.text({ label: 'Subtitle (optional)', validation: { isRequired: false } }),
        body: fields.markdoc({ label: 'Body' }),
      },
    }),
  },
});
```

- [ ] **Step 2: Verify the build still compiles**

```bash
~/.local/bin/pnpm astro build 2>&1 | tail -40
```

Expected: build succeeds. New: KeyStatic's virtual modules now resolve to your config. There may be a TypeScript warning about implicit `any` in the config — that's fine, the runtime works.

Known risks:
- `fields.markdoc` may write `.mdoc` files by default. Our existing files are `.md`. If the build complains about format mismatch, change `format: { contentField: 'body' }` to `format: { contentField: 'body', dataLocation: 'index' }` OR explicitly set the file extension. Check KeyStatic docs for the exact option name in v0.5.x. If `markdoc` doesn't fit, try `fields.text({ multiline: true })` for the body as a fallback (loses rich-text editor but Nina's existing content is plain markdown anyway).
- If KeyStatic refuses to write the body as raw markdown, swap `format: { contentField: 'body' }` for `format: 'json'` and accept that body content goes into JSON (NOT what we want — only as a debugging step). Stop and reconsider — the real fix is finding the right body field type for raw markdown output. Search KeyStatic GitHub issues for "markdown" or "raw markdown body".

- [ ] **Step 3: Commit**

```bash
git add keystatic.config.tsx
git commit -m "feat(keystatic): add schema mirroring tina/config.ts (flat, no conditional)"
```

---

## Task 3: Wire admin route + verify routes register

**Files:**
- Create: `src/pages/keystatic/[...params].astro`
- Create: `src/pages/api/keystatic/[...params].ts`

The `@keystatic/astro` integration *should* register these automatically — but if it doesn't (or if the integration approach doesn't work in your Astro version), these files create them explicitly using the internal exports.

- [ ] **Step 1: Check whether keystatic() integration auto-added routes**

```bash
~/.local/bin/pnpm astro build 2>&1 | grep -E "keystatic|/admin"
```

Look for any routes like `/keystatic/*` in the build output's route list. If you see them, KeyStatic is registering routes automatically — skip to Step 4 (verify build).

If you DON'T see them, proceed to Step 2 to add them manually.

- [ ] **Step 2: Create the admin UI page route**

```bash
mkdir -p src/pages/keystatic src/pages/api/keystatic
```

Create `src/pages/keystatic/[...params].astro`:

```astro
---
export { Keystatic as default } from '@keystatic/astro/internal/keystatic-page';
---
```

Note: the export name `Keystatic` is the component re-exported from `@keystatic/astro/internal/keystatic-page.js`. We use `export ... as default` so Astro treats this file as a page-level component.

- [ ] **Step 3: Create the API catchall route**

Create `src/pages/api/keystatic/[...params].ts`:

```ts
export { ALL, prerender } from '@keystatic/astro/internal/keystatic-api';
```

This re-exports the request handler (`ALL` matches every HTTP method) and the `prerender = false` flag so this route stays SSR.

- [ ] **Step 4: Rebuild and verify routes register**

```bash
~/.local/bin/pnpm astro build 2>&1 | tail -30
```

Expected: build succeeds, and (if you can find Astro's route listing in the output) `/keystatic/*` and `/api/keystatic/*` appear as SSR routes. Most other routes are prerendered.

- [ ] **Step 5: Commit**

```bash
git add src/pages/keystatic src/pages/api/keystatic
git commit -m "feat(keystatic): wire admin UI + API routes"
```

---

## Task 4: Verify locally with `kind: 'local'` storage

**Files:** No code changes. Temporarily set env var to switch storage mode.

This proves the schema works end-to-end against actual content files before we depend on GitHub OAuth.

- [ ] **Step 1: Start the dev server with local storage**

```bash
KEYSTATIC_STORAGE=local ~/.local/bin/pnpm astro dev 2>&1 | head -20
```

Wait until you see "Local:  http://localhost:4321/" or similar.

- [ ] **Step 2: In a browser, open the admin**

Navigate to `http://localhost:4321/keystatic/`.

Expected: KeyStatic admin loads with sidebar showing **Content** (Posts, Portfolio, Noticing) and **Site state** (On her desk, Site config, About page). No login screen because storage is local.

- [ ] **Step 3: Verify each collection lists existing entries**

- Click **Posts**. You should see 6+ entries (the existing notes-from-the-build posts plus Darth_Maul_2026 if still present).
- Click into one (e.g. `01-the-brief`). Form should render with `type: essay` selected, title, dek, body content visible.
- Verify all six post types render their forms — open one of each type to check.

If a field is missing or has the wrong name, `keystatic.config.tsx` has a mistake — fix it. The field name in KeyStatic config MUST match the field name in the markdown frontmatter exactly.

- [ ] **Step 4: Verify a save round-trips**

- Edit `01-the-brief`. Add a single word to the body. Click **Save**.
- Stop the dev server (Ctrl-C).
- Check git diff:

```bash
git diff src/content/posts/notes-from-the-build/01-the-brief.md
```

Expected: only your one-word change. NO frontmatter restructuring (no `discriminant`/`value` wrapper). NO field reordering that would scare Astro's parser. NO `_template:` field added.

If the diff looks bad: KeyStatic's serializer is mangling the file. STOP. Investigate before continuing — this is the same class of issue as the Tina lock-file problem we just escaped.

- [ ] **Step 5: Revert the test edit**

```bash
git checkout src/content/posts/notes-from-the-build/01-the-brief.md
```

- [ ] **Step 6: Run astro build to confirm content still validates**

```bash
~/.local/bin/pnpm astro build 2>&1 | tail -20
```

Expected: build succeeds, all posts validate against the Zod schema in `src/content/config.ts`.

- [ ] **Step 7: Commit any tweaks**

If you fixed schema mistakes in this task, commit them:

```bash
git add keystatic.config.tsx
git commit -m "fix(keystatic): align schema field names with existing frontmatter"
```

---

## Task 5: GitHub OAuth App setup (manual — user step)

**Files:** None in this task. User performs this in GitHub + Cloudflare web UIs.

**Why this needs the user:** Creating OAuth apps and adding secrets are sensitive operations that should be done by the repo owner directly.

- [ ] **Step 1: User creates GitHub OAuth App**

Direct the user to: https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**

Settings:
- **Application name**: `Blue Studio CMS` (or any label)
- **Homepage URL**: `https://bluestudio.space`
- **Authorization callback URL**: `https://bluestudio.space/api/keystatic/github/oauth/callback`

After save, the user copies:
- **Client ID** (visible immediately)
- **Client Secret** (click "Generate a new client secret" and copy once — GitHub only shows it once)

- [ ] **Step 2: User adds Cloudflare Pages env vars**

Direct the user to: Cloudflare dashboard → Pages → `blue-studio` project → **Settings** → **Environment variables** → **Production**.

Add three variables (and mirror them to **Preview** so preview deploys work):

| Variable | Value |
|---|---|
| `KEYSTATIC_GITHUB_CLIENT_ID` | (from Step 1) |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | (from Step 1) |
| `KEYSTATIC_SECRET` | A random 32+ character string. Generate with `openssl rand -hex 32` |

For preview/branch deploys, ALSO create a separate OAuth App with callback `https://<preview-branch>.blue-studio.pages.dev/api/keystatic/github/oauth/callback` OR use Cloudflare's wildcard hostname feature. The simplest path for v1: a single OAuth app with the production callback, and accept that auth-related testing happens on the production domain after merge.

- [ ] **Step 3: User confirms Nina has Write access to the repo**

Direct the user to: https://github.com/NickCason/blue-studio/settings/access

Verify Nina (ninapfeiffer54 or her actual GitHub username) is listed with **Write** access. If not, add her. Without Write access, OAuth will succeed but commits will fail with 403.

- [ ] **Step 4: User confirms by replying "OAuth setup complete"**

Wait for explicit user confirmation before proceeding to Task 6. Do not assume.

---

## Task 6: Push branch + verify on Cloudflare preview deploy

**Files:** None changed. Pushes existing branch.

- [ ] **Step 1: Push branch**

```bash
git push -u origin migrate/keystatic
```

If the push fails with a `workflow` scope error (it might, since this branch touches `.github/workflows/deploy.yml` — wait, it doesn't yet, the Tina removal in Task 8 does). For now, push should succeed since we haven't touched workflows.

- [ ] **Step 2: Wait for Cloudflare Pages preview build**

Either monitor in Cloudflare dashboard, or:

```bash
gh run list --repo NickCason/blue-studio --branch migrate/keystatic --limit 1
```

(Note: GitHub Actions runs the *deploy* workflow which pushes to Cloudflare. Cloudflare Pages itself also builds a preview from the branch directly if connected to GitHub — use whichever URL surfaces first.)

- [ ] **Step 3: Find the preview URL**

Cloudflare Pages preview URL pattern: `https://migrate-keystatic.<project-id>.pages.dev` (the dashboard tells you the exact subdomain).

- [ ] **Step 4: Manually test the preview**

Direct the user to:

1. Open `https://migrate-keystatic.<...>.pages.dev/keystatic/` in a browser.
2. Should redirect to GitHub OAuth (the new app from Task 5).
3. Sign in with GitHub.
4. Should land back on the KeyStatic admin, signed in.
5. Open Posts → click an existing post → make a trivial edit (one word in body) → click Save.
6. KeyStatic should commit the change to `migrate/keystatic` branch on GitHub.
7. Verify by checking `git log migrate/keystatic` for the new commit (KeyStatic commits authored as the GitHub-authenticated user).

- [ ] **Step 5: If issues, iterate**

Common preview-deploy issues:
- **"Failed to authenticate with GitHub"** — Client ID/Secret env vars not set in preview env. Fix in Cloudflare dashboard.
- **"Cannot commit, 403"** — Nina (or whoever's testing) doesn't have Write access on the repo. Fix in GitHub repo settings.
- **404 on `/keystatic/`** — the catchall routes from Task 3 didn't get included in the deploy. Check `dist/_worker.js` exists in CI artifacts. Verify `keystatic()` integration is in `astro.config.mjs`.
- **Admin loads but fields are missing** — schema mismatch between `keystatic.config.tsx` and existing content. Same fix as Task 4 Step 4.

Don't move to Task 7 until at least one successful edit-and-save round trip on the preview deploy.

- [ ] **Step 6: User confirms by replying "preview works"**

Wait for explicit user confirmation. Once confirmed, the preview should also be left running so Nina can test it herself before cutover.

---

## Task 7: Cutover — merge branch to main

**Files:** None modified directly. Git merge.

- [ ] **Step 1: Update branch from main first** (in case main moved during the migration work)

```bash
git fetch origin
git rebase origin/main
```

If conflicts, resolve them (most likely in `astro.config.mjs` if anyone touched it on main). Push the rebased branch:

```bash
git push --force-with-lease origin migrate/keystatic
```

- [ ] **Step 2: Merge to main**

```bash
git checkout main
git merge --no-ff migrate/keystatic -m "feat: migrate from Tina Cloud to KeyStatic"
git push origin main
```

Use `--no-ff` to preserve the migration as a single mergeable unit in history.

- [ ] **Step 3: Watch the production deploy**

```bash
gh run list --repo NickCason/blue-studio --limit 1
gh run watch <run-id> --repo NickCason/blue-studio --exit-status
```

Expected: deploy succeeds.

- [ ] **Step 4: Smoke test production**

Direct the user to:
1. Open `https://bluestudio.space/` — public site should look identical to before.
2. Open `https://bluestudio.space/keystatic/` — sign in flow should work end-to-end.
3. Make a real test edit (e.g. update `site` singleton's tagline by one word) → save → verify the commit appears on `main` and the deploy fires.
4. Revert that edit so we don't leave a junk commit.

- [ ] **Step 5: Have Nina sign in**

Direct the user to share `https://bluestudio.space/keystatic/` with Nina. Confirm she can sign in (separate from her broken Tina account — KeyStatic uses GitHub OAuth, so as long as her GitHub account has Write access on the repo, she's in).

- [ ] **Step 6: User confirms by replying "Nina is in"**

Wait for explicit confirmation. KeyStatic is now the live CMS. Tina is still in the repo but unused.

---

## Task 8: Remove Tina

**Files:**
- Delete: `tina/` (entire directory).
- Delete: `.github/workflows/notify-tina.yml`.
- Modify: `package.json` (drop `tinacms`, `@tinacms/cli`).
- Modify: `.github/workflows/deploy.yml` (drop Tina cache + build steps, simplify build command).
- Modify: `README.md` (drop Tina references).
- Modify: `CLAUDE.md` if it exists (drop Tina references). Check with `ls CLAUDE.md`.

Do this in a separate commit so it's easy to revert if anything in production turns out to depend on Tina that we missed.

- [ ] **Step 1: Delete Tina directory and workflow**

```bash
rm -rf tina/
rm .github/workflows/notify-tina.yml
```

- [ ] **Step 2: Remove Tina from package.json**

Use Edit/jq/manual edit to remove these from `dependencies`:
- `"@tinacms/cli": "^2.2.5"`
- `"tinacms": "^3.7.5"`

Then:

```bash
~/.local/bin/pnpm install
```

This regenerates `pnpm-lock.yaml` without Tina deps.

- [ ] **Step 3: Simplify deploy.yml**

Open `.github/workflows/deploy.yml`. Find and remove:
- The "Cache Tina admin SPA" step (entire block).
- The "Build Tina admin (only if cache miss)" step.
- Change `pnpm tinacms build --skip-cloud-checks && pnpm astro build` to just `pnpm astro build`.
- Drop `TINA_PUBLIC_CLIENT_ID` and `TINA_TOKEN` from the env blocks of any remaining steps (they were used to feed `tinacms build`).

Keep other env vars (`PUBLIC_FORMSPREE_ENDPOINT`, `PUBLIC_SITE_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) — those are still needed.

- [ ] **Step 4: Update README**

Open `README.md`. Find references to Tina (search for "tina" case-insensitive). Replace with KeyStatic equivalents:
- `TINA_PUBLIC_CLIENT_ID` row → drop (replaced by `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`).
- Admin URL `/admin/` → `/keystatic/`.
- "Tina Cloud" → "KeyStatic (git-backed, no external CMS service)".

- [ ] **Step 5: Update CLAUDE.md if exists**

```bash
ls CLAUDE.md AGENTS.md 2>&1
```

If either exists, open and update Tina references the same way as README. If neither exists, skip.

- [ ] **Step 6: Verify build still passes**

```bash
~/.local/bin/pnpm astro build 2>&1 | tail -20
```

Expected: build succeeds without Tina deps.

- [ ] **Step 7: Commit and push**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: remove TinaCMS now that KeyStatic is live

- Delete tina/ directory and notify-tina workflow.
- Drop tinacms + @tinacms/cli from deps.
- Simplify deploy.yml (no more Tina admin SPA build/cache step).
- Update README/CLAUDE.md references to /keystatic/."
git push origin main
```

- [ ] **Step 8: Verify production deploy passes one more time**

```bash
gh run watch $(gh run list --repo NickCason/blue-studio --limit 1 --json databaseId -q '.[0].databaseId') --repo NickCason/blue-studio --exit-status
```

Expected: success. Production site loads. `/keystatic/` still works. Tina is gone.

- [ ] **Step 9: User confirms by replying "Tina removed cleanly"**

Migration complete.

---

## Notes for the executing agent

**Project-specific memory:** Before starting Task 1, read `/home/nick/.claude/projects/-home-nick-blue-studio/memory/MEMORY.md` and any linked files there. Two pieces of feedback are highly relevant:

1. `feedback-cache-is-system-problem.md` — Never tell the user to hard-refresh, clear cache, or "wait for X to reindex" as a diagnostic step. If the migration produces a stuck state, that's a pipeline bug; fix the pipeline.

2. `feedback-tina-lock-must-be-committed.md` — Historical context on why we're migrating. The Tina lock-file fragility is the root cause; KeyStatic eliminates the equivalent failure mode entirely.

**Git identity on this machine:** Commits use `Nick Cason <nickcason@Nicks-MacBook-Air.local>` (matches the user's MacBook identity). Set via env vars per commit:

```bash
GIT_AUTHOR_NAME="Nick Cason" \
GIT_AUTHOR_EMAIL="nickcason@Nicks-MacBook-Air.local" \
GIT_COMMITTER_NAME="Nick Cason" \
GIT_COMMITTER_EMAIL="nickcason@Nicks-MacBook-Air.local" \
git commit -m "..."
```

Do NOT modify `git config` — the env-var-per-commit pattern keeps `~/.gitconfig` untouched (which the user prefers).

**Pushing branches that touch `.github/workflows/*`:** The current Personal Access Tokens on this machine lack `workflow` scope. Pushing changes to workflow files (Task 8 modifies `deploy.yml` and deletes `notify-tina.yml`) will fail with `refusing to allow an OAuth App to create or update workflow`. Resolution: ask the user to run `gh auth refresh -s workflow` interactively (via `! gh auth refresh -s workflow` in the prompt) before Task 8 Step 7.

**Don't reset, don't force-push without `--force-with-lease`:** The user has been burned by destructive git operations during this work. Only Task 7 Step 1 uses `--force-with-lease` and it's deliberate. Anywhere else, use plain pushes.

**Do NOT pause on schema design alternatives during Task 2.** The flat-frontmatter decision is final for this migration (see plan header). If you discover a concrete technical blocker that requires re-evaluating it, stop and surface the blocker before changing approach.

**If the build fails in any step:** capture the FULL error output, search the repo's git log for past fixes (`git log --all --oneline | grep -iE "fix|astro|keystatic"`), and only revert to the prior commit as a last resort. The user prefers to fix forward.
