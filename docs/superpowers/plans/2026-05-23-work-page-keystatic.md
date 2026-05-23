# Work page → editable in Keystatic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Nina edit every visible piece of the `/work` page through Keystatic, with no visual change to the rendered page.

**Architecture:** Add a `workPage` Keystatic singleton stored as JSON at `src/content/pages/work.json`. Add a matching `workPage` Astro content collection (`type: 'data'`) with a zod schema. Replace the hardcoded strings in `src/pages/work/index.astro` with reads from that entry. Mirrors the existing `now` / `site` singleton pattern; no CSS or layout changes.

**Tech Stack:** Astro 5 (server mode, per-route `prerender = true`), Keystatic 0.5 (`@keystatic/core`, `@keystatic/astro`), zod via `astro:content`, Phosphor Duotone icons, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-23-work-page-keystatic-design.md`

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `keystatic.config.tsx` | Modify | Add `workPage` singleton + navigation entry. |
| `src/content/config.ts` | Modify | Add `workPage` data collection with zod schema. |
| `src/content/pages/work.json` | Create | Seed file with current production copy. |
| `src/pages/work/index.astro` | Modify | Replace hardcoded strings with reads from the singleton. |

No new components, no CSS changes, no new dependencies.

---

## Pre-flight

- [ ] **Step 1: Confirm repo and branch**

Run: `cd /home/nick/blue-studio && git status && git branch --show-current`
Expected: branch `main`, working tree clean (the spec has already been committed on `main`).

- [ ] **Step 2: Create a feature branch**

Run:
```bash
cd /home/nick/blue-studio
git checkout -b feat/work-page-keystatic
```
Expected: `Switched to a new branch 'feat/work-page-keystatic'`.

- [ ] **Step 3: Install deps if not already present**

Run: `cd /home/nick/blue-studio && pnpm install`
Expected: completes without errors. If `node_modules` is already present and lockfile-consistent, this is a no-op.

---

## Task 1: Add the `workPage` Astro data collection schema

**Files:**
- Modify: `src/content/config.ts`

This locks down the JSON shape at build time. We add the schema first so the seed file in Task 2 is validated the moment it's created.

- [ ] **Step 1: Open the file and read it**

Run: read `src/content/config.ts`. Note the existing `pages` collection (lines ~120–126) and the `collections` export (last line).

- [ ] **Step 2: Add the schema and collection definition**

Insert this block immediately above the existing `export const collections = ...` line. It mirrors the spec's schema section verbatim.

```ts
const workPage = defineCollection({
  type: 'data',
  schema: z.object({
    seo: z.object({
      title: z.string(),
      description: z.string(),
    }),
    hero: z.object({
      eyebrow: z.string(),
      heading: z.string(),
      headingAmp: z.string(),
      sub: z.string(),
      ctaLabel: z.string(),
    }),
    services: z.object({
      eyebrow: z.string(),
      items: z
        .array(
          z.object({
            icon: z.string(),
            title: z.string(),
            body: z.string(),
          }),
        )
        .default([]),
    }),
    fit: z.object({
      eyebrow: z.string(),
      yesHeading: z.string(),
      yesItems: z.array(z.string()).default([]),
      noHeading: z.string(),
      noItems: z.array(z.string()).default([]),
    }),
    contact: z.object({
      heading: z.string(),
      sub: z.string(),
      namePlaceholder: z.string(),
      emailPlaceholder: z.string(),
      messagePlaceholder: z.string(),
      submitLabel: z.string(),
      fallbackEmail: z.string(),
    }),
  }),
});
```

- [ ] **Step 3: Add the new collection to the export**

Change the last line from:
```ts
export const collections = { posts, portfolio, now, noticing, site, pages };
```
to:
```ts
export const collections = { posts, portfolio, now, noticing, site, pages, workPage };
```

- [ ] **Step 4: Type-check**

Run: `cd /home/nick/blue-studio && pnpm exec astro check`
Expected: no errors. (Astro will warn that the `workPage` collection has no entries yet — that's fine; the seed lands in Task 2.)

If `astro check` complains about a missing entry rather than just warning, proceed to Task 2 — the build only requires entries when something queries the collection, and nothing queries it until Task 4.

- [ ] **Step 5: Commit**

```bash
cd /home/nick/blue-studio
git add src/content/config.ts
git commit -m "feat(content): add workPage data collection schema"
```

---

## Task 2: Seed `src/content/pages/work.json` with the current copy

**Files:**
- Create: `src/content/pages/work.json`

The seed contains today's exact production copy so that when the page rendering switches over in Task 4, the rendered output is byte-identical.

- [ ] **Step 1: Confirm parent directory exists**

Run: `ls /home/nick/blue-studio/src/content/pages`
Expected: contains `about.md`. The directory already exists.

- [ ] **Step 2: Write the seed file**

Create `src/content/pages/work.json` with this exact content:

```json
{
  "seo": {
    "title": "Work with me — Blue Studio",
    "description": "Quiet marketing for the patient, and the patiently impatient. Brand voice, content strategy, campaign copy by Nina Pfeiffer."
  },
  "hero": {
    "eyebrow": "For brands done performing",
    "heading": "Quiet marketing for the patient,",
    "headingAmp": "and the patiently impatient",
    "sub": "I write brand voice, content strategy, and campaign copy for small businesses that want to sound like themselves again. No \"engagement-bait.\" No twelve posts a week. Just one true thing, well said, on a useful cadence.",
    "ctaLabel": "Tell me about your brand"
  },
  "services": {
    "eyebrow": "What we do",
    "items": [
      {
        "icon": "ph-quotes",
        "title": "Brand voice & messaging",
        "body": "The way the brand sounds in writing — guidelines, tone, vocabulary, what it doesn't say. Includes a voice doc you'll actually use."
      },
      {
        "icon": "ph-calendar-blank",
        "title": "Content strategy",
        "body": "What to post, on what cadence, and (just as important) what to stop doing. Editorial calendars built around your real capacity."
      },
      {
        "icon": "ph-pen-nib",
        "title": "Campaign concepts & copy",
        "body": "Launches, seasonal pushes, the occasional manifesto. From idea to written assets, ready to ship."
      },
      {
        "icon": "ph-flame",
        "title": "Slow retainers",
        "body": "One good thing per week. Could be a post, an email, a campaign brief — whatever the brand actually needs that week."
      }
    ]
  },
  "fit": {
    "eyebrow": "Is this for you?",
    "yesHeading": "Probably yes if —",
    "yesItems": [
      "You think your brand sounds like everyone else's and it bothers you.",
      "You'd rather post less and mean it more.",
      "You want a writer in the room, not a \"content creator.\"",
      "Your audience doesn't show up for trends. Yours."
    ],
    "noHeading": "Probably no if —",
    "noItems": [
      "You need 30 pieces of content this month, no preference on which.",
      "Your strategy is \"go viral.\"",
      "You want someone to manage your DMs.",
      "The brief is \"make us sound like <competitor>.\""
    ]
  },
  "contact": {
    "heading": "Tell me about your brand.",
    "sub": "A few sentences is plenty. I'll write back within a week.",
    "namePlaceholder": "Your name",
    "emailPlaceholder": "Email",
    "messagePlaceholder": "What does the brand do? What feels off about how it currently sounds? What would 'better' look like to you?",
    "submitLabel": "Send",
    "fallbackEmail": "hello@bluestudio.space"
  }
}
```

Note on the `noItems` array's last entry: the original Astro file rendered `&lt;competitor&gt;` so the browser would display literal angle brackets. In JSON we store the real characters `<competitor>`; Astro's JSX rendering will escape them at output time, producing the same on-screen result.

- [ ] **Step 3: Type-check that the seed validates**

Run: `cd /home/nick/blue-studio && pnpm exec astro check`
Expected: no errors. Astro discovers the new entry and validates it against the zod schema added in Task 1.

- [ ] **Step 4: Commit**

```bash
cd /home/nick/blue-studio
git add src/content/pages/work.json
git commit -m "feat(content): seed work.json with current production copy"
```

---

## Task 3: Add the `workPage` Keystatic singleton

**Files:**
- Modify: `keystatic.config.tsx`

This exposes the schema to Nina in the CMS. The Keystatic schema must stay in lockstep with the zod schema from Task 1.

- [ ] **Step 1: Open the file and read it**

Read `keystatic.config.tsx`. Note:
- The existing `singletons` block (lines ~196–246) with `now`, `site`, `aboutPage`.
- The `ui.navigation` block (lines ~47–53) listing `'Site state': ['now', 'site', 'aboutPage']`.

- [ ] **Step 2: Add the icon-options constant near the top**

Insert after the existing `postTypeField` constant (around line 36, before `export default config(...)`):

```ts
const workIconOptions = [
  { label: 'Quote marks', value: 'ph-quotes' },
  { label: 'Pen nib', value: 'ph-pen-nib' },
  { label: 'Calendar', value: 'ph-calendar-blank' },
  { label: 'Flame', value: 'ph-flame' },
  { label: 'Notebook', value: 'ph-notebook' },
  { label: 'Compass', value: 'ph-compass' },
  { label: 'Feather', value: 'ph-feather' },
  { label: 'Star', value: 'ph-star' },
  { label: 'Moon', value: 'ph-moon' },
  { label: 'Sparkle', value: 'ph-sparkle' },
  { label: 'Sun (dim)', value: 'ph-sun-dim' },
  { label: 'Leaf', value: 'ph-leaf' },
  { label: 'Heart', value: 'ph-heart' },
  { label: 'Coffee', value: 'ph-coffee' },
  { label: 'Envelope', value: 'ph-envelope-simple' },
  { label: 'Megaphone (soft)', value: 'ph-megaphone-simple' },
  { label: 'Lightbulb', value: 'ph-lightbulb' },
  { label: 'Bookmark', value: 'ph-bookmark-simple' },
] as const;
```

- [ ] **Step 3: Add the singleton inside the `singletons` block**

Inside `singletons: { ... }`, add `workPage` immediately after `site` and before `aboutPage`. Paste this block verbatim:

```tsx
    workPage: singleton({
      label: 'Work page',
      path: 'src/content/pages/work',
      format: 'json',
      schema: {
        seo: fields.object(
          {
            title: fields.text({ label: 'SEO title' }),
            description: fields.text({ label: 'SEO description', multiline: true }),
          },
          { label: 'SEO' },
        ),
        hero: fields.object(
          {
            eyebrow: fields.text({ label: 'Eyebrow (small caps label above heading)' }),
            heading: fields.text({
              label: 'Heading (first line)',
              multiline: true,
            }),
            headingAmp: fields.text({
              label: 'Heading accent (italicized second line)',
              description: 'Rendered in italic accent color after a line break.',
            }),
            sub: fields.text({ label: 'Sub-heading paragraph', multiline: true }),
            ctaLabel: fields.text({ label: 'CTA button label' }),
          },
          { label: 'Hero' },
        ),
        services: fields.object(
          {
            eyebrow: fields.text({ label: 'Section eyebrow (e.g. "What we do")' }),
            items: fields.array(
              fields.object({
                icon: fields.select({
                  label: 'Icon',
                  options: workIconOptions,
                  defaultValue: 'ph-quotes',
                }),
                title: fields.text({ label: 'Card title' }),
                body: fields.text({ label: 'Card body', multiline: true }),
              }),
              {
                label: 'Service cards',
                itemLabel: (props) => props.fields.title.value || '(untitled card)',
              },
            ),
          },
          { label: 'Services' },
        ),
        fit: fields.object(
          {
            eyebrow: fields.text({ label: 'Section eyebrow (e.g. "Is this for you?")' }),
            yesHeading: fields.text({ label: '"Yes" column heading' }),
            yesItems: fields.array(fields.text({ label: 'Bullet' }), {
              label: '"Yes" bullets',
              itemLabel: (props) => props.value,
            }),
            noHeading: fields.text({ label: '"No" column heading' }),
            noItems: fields.array(fields.text({ label: 'Bullet' }), {
              label: '"No" bullets',
              itemLabel: (props) => props.value,
            }),
          },
          { label: 'Fit (Probably yes / Probably no)' },
        ),
        contact: fields.object(
          {
            heading: fields.text({ label: 'Contact heading' }),
            sub: fields.text({ label: 'Contact sub-line', multiline: true }),
            namePlaceholder: fields.text({ label: 'Name field placeholder' }),
            emailPlaceholder: fields.text({ label: 'Email field placeholder' }),
            messagePlaceholder: fields.text({
              label: 'Message field placeholder',
              multiline: true,
            }),
            submitLabel: fields.text({ label: 'Submit button label' }),
            fallbackEmail: fields.text({
              label: 'Fallback email (shown when Formspree is unconfigured)',
            }),
          },
          { label: 'Contact' },
        ),
      },
    }),
```

- [ ] **Step 4: Add `workPage` to the navigation group**

Change the navigation line from:
```ts
      'Site state': ['now', 'site', 'aboutPage'],
```
to:
```ts
      'Site state': ['now', 'site', 'workPage', 'aboutPage'],
```

- [ ] **Step 5: Type-check**

Run: `cd /home/nick/blue-studio && pnpm exec astro check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/nick/blue-studio
git add keystatic.config.tsx
git commit -m "feat(keystatic): expose work page as editable singleton"
```

---

## Task 4: Switch `src/pages/work/index.astro` to read from the singleton

**Files:**
- Modify: `src/pages/work/index.astro:1-63`

This is the only change to the rendered page. The HTML structure and the entire `<style>` block stay byte-identical; only the source of each string changes.

- [ ] **Step 1: Replace the frontmatter (lines 1–8) with a CMS-aware version**

Replace lines 1–8 (the current frontmatter) with:

```astro
---
export const prerender = true;
import { getEntry } from 'astro:content';
import Base from '~/layouts/Base.astro';

const entry = await getEntry('workPage', 'work');
if (!entry) throw new Error('Missing src/content/pages/work.json');
const { seo, hero, services, fit, contact } = entry.data;

const formspree = import.meta.env.PUBLIC_FORMSPREE_ENDPOINT || '';
// Portfolio entries are hidden in production while the section is being
// re-set. The full layout — with selected-work tiles — lives at
// /preview/work/ for Nina to play with until launch.
---
```

- [ ] **Step 2: Replace the `<Base>` opening tag**

Find:
```astro
<Base title="Work with me — Blue Studio" description="Quiet marketing for the patient, and the patiently impatient. Brand voice, content strategy, campaign copy by Nina Pfeiffer.">
```
Replace with:
```astro
<Base title={seo.title} description={seo.description}>
```

- [ ] **Step 3: Replace the hero section**

Find the existing `<section class="hero">…</section>` block and replace with:

```astro
  <section class="hero">
    <div class="eyebrow eyebrow-rule"><span /><span>{hero.eyebrow}</span><span /></div>
    <h1 class="hed serif-italic">{hero.heading}<br /><em class="amp">{hero.headingAmp}</em>.</h1>
    <p class="sub serif">{hero.sub}</p>
    <a href="#contact" class="cta">{hero.ctaLabel} <i class="ph-duotone ph-arrow-right"></i></a>
  </section>
```

Note the literal `.` after `</em>` — see the spec's "Rendering changes" section for why the trailing period is in the template, not in `headingAmp`.

- [ ] **Step 4: Replace the services section**

Find the existing `<section class="services">…</section>` block and replace with:

```astro
  <section class="services">
    <div class="section-label"><span>✦</span><span>{services.eyebrow}</span><span>✦</span></div>
    <div class="grid">
      {services.items.map((item) => (
        <div class="card">
          <i class={`ph-duotone ${item.icon}`}></i>
          <h4 class="serif-italic">{item.title}</h4>
          <p>{item.body}</p>
        </div>
      ))}
    </div>
  </section>
```

- [ ] **Step 5: Replace the fit section**

Find the existing `<section class="fit">…</section>` block and replace with:

```astro
  <section class="fit">
    <div class="section-label"><span>✦</span><span>{fit.eyebrow}</span><span>✦</span></div>
    <div class="grid">
      <div class="yes">
        <h5 class="serif-italic">{fit.yesHeading}</h5>
        <ul>
          {fit.yesItems.map((item) => (
            <li><i class="ph-duotone ph-check-circle"></i>{item}</li>
          ))}
        </ul>
      </div>
      <div class="no">
        <h5 class="serif-italic">{fit.noHeading}</h5>
        <ul>
          {fit.noItems.map((item) => (
            <li><i class="ph-duotone ph-x-circle"></i>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  </section>
```

- [ ] **Step 6: Replace the contact section**

Find the existing `<section class="contact" id="contact">…</section>` block and replace with:

```astro
  <section class="contact" id="contact">
    <h3 class="serif-italic">{contact.heading}</h3>
    <p class="sub-small">{contact.sub}</p>
    {formspree ? (
      <form class="form" action={formspree} method="POST">
        <input type="text" name="name" placeholder={contact.namePlaceholder} required />
        <input type="email" name="email" placeholder={contact.emailPlaceholder} required />
        <textarea name="message" placeholder={contact.messagePlaceholder} required></textarea>
        <button type="submit">{contact.submitLabel} <i class="ph-duotone ph-paper-plane-tilt"></i></button>
      </form>
    ) : (
      <p class="form-fallback serif-italic">Email <a href={`mailto:${contact.fallbackEmail}`}>{contact.fallbackEmail}</a> for now.</p>
    )}
  </section>
```

- [ ] **Step 7: Leave the `<style>` block exactly as-is**

Do not touch the `<style>` block (lines ~65 to end). Every selector still matches the rendered DOM.

- [ ] **Step 8: Type-check**

Run: `cd /home/nick/blue-studio && pnpm exec astro check`
Expected: no errors.

- [ ] **Step 9: Build**

Run: `cd /home/nick/blue-studio && pnpm build`
Expected: completes successfully. Inspect the build log for the `/work/` route — it should still report as prerendered.

- [ ] **Step 10: Commit**

```bash
cd /home/nick/blue-studio
git add src/pages/work/index.astro
git commit -m "feat(work): read page content from keystatic singleton"
```

---

## Task 5: Manual verification

This is the final smoke. No code changes — just confirm the result.

- [ ] **Step 1: Start the dev server**

Run: `cd /home/nick/blue-studio && pnpm dev`
Expected: dev server starts on `http://localhost:4321` (or the configured port).

- [ ] **Step 2: Visit `/work/` and compare to the production page**

Open `http://localhost:4321/work/` in a browser. Visually compare to the current production page (or the same page on `main` before this branch). Every section should look identical: hero heading + italic accent, four service cards with their original icons in the same order, both yes/no lists with four bullets each in the same order, contact form with the same placeholders.

If anything looks different, the most likely cause is a typo in `work.json` — diff the strings against the original Astro file (commit `ce01f5d` is a good reference) and fix the JSON.

- [ ] **Step 3: Open Keystatic and verify the editing surface**

Set `KEYSTATIC_STORAGE=local` (see `keystatic.config.tsx:39-45`) if not already configured for local editing, then open `http://localhost:4321/keystatic/`. Under **Site state**, confirm a new **Work page** entry exists between **Site config** and **About page**. Open it and confirm:
- Four labeled sections (SEO, Hero, Services, Fit, Contact) plus the standard Keystatic save bar.
- The services section shows an array editor with four items; opening one shows the icon dropdown with friendly labels (Quote marks, Pen nib, …).
- The fit section shows two arrays of bullets, each with four items.
- The contact section shows the placeholder/label fields.

- [ ] **Step 4: Make a smoke-test edit and revert**

In Keystatic, change the hero CTA from "Tell me about your brand" to "Tell me about your brand!" and save. Confirm the dev server hot-reloads and the button text changes in the browser. Then change it back to the original and save again.

- [ ] **Step 5: Stop the dev server**

Press Ctrl+C in the terminal running `pnpm dev`.

- [ ] **Step 6: Confirm working tree clean**

Run: `cd /home/nick/blue-studio && git status`
Expected: working tree clean. (The smoke edit in Step 4 was reverted and re-saved, so the JSON's checked-in state should match what Task 2 committed.)

If the JSON is not clean, run `git diff src/content/pages/work.json` to see what drifted; usually it's a minor whitespace change Keystatic's serializer made. Either commit it as a separate "chore: keystatic serializer formatting" commit or `git checkout` it.

---

## Task 6: Push the branch and open a PR

- [ ] **Step 1: Push the branch**

Run:
```bash
cd /home/nick/blue-studio
git push -u origin feat/work-page-keystatic
```

- [ ] **Step 2: Open the PR**

Run:
```bash
cd /home/nick/blue-studio
gh pr create --title "feat: make the work page editable in keystatic" --body "$(cat <<'EOF'
## Summary
- Adds a `workPage` Keystatic singleton (`src/content/pages/work.json`) so Nina can edit every visible string on `/work/` — hero, four service cards (icon + title + body), yes/no fit bullets, contact placeholders, SEO — through the CMS.
- Mirrors the singleton in `src/content/config.ts` with a zod schema so build-time validation catches schema drift.
- Replaces hardcoded strings in `src/pages/work/index.astro` with reads from the singleton. No CSS, layout, or HTML-structure changes.
- Service icons are picked from a curated dropdown of ~18 Phosphor Duotone glyphs.

## Out of scope
- The hidden selected-work / portfolio block stays hidden; `/preview/work/` is untouched.
- About page is unchanged.

## Test plan
- [ ] `pnpm build` succeeds
- [ ] `/work/` renders byte-identical to current production
- [ ] Keystatic shows the new "Work page" entry under Site state with all four sections editable
- [ ] Editing a service card title hot-reloads in dev

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: prints the PR URL.

---

## Self-Review

**Spec coverage:**
- Schema (spec §Approach) → Task 1 (zod) + Task 3 (Keystatic). ✓
- Curated icon list (spec §Approach) → Task 3 Step 2 (`workIconOptions`). ✓
- "Why JSON, not markdown frontmatter" decision → encoded in Task 1's `type: 'data'` + Task 3's `format: 'json'`. ✓
- Rendering changes for hero/services/fit/contact (spec §Rendering changes) → Task 4 Steps 3–6 with verbatim JSX. ✓
- Initial seed (spec §Initial seed file) → Task 2. ✓
- Validation & error handling (spec §Validation) → zod schema (Task 1) + explicit "Missing src/content/pages/work.json" throw (Task 4 Step 1). ✓
- Testing (spec §Testing) → Task 5 manual verification. ✓
- Out of scope (spec) → respected; no portfolio/preview/about touches in any task. ✓

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague instructions. Every code change has the exact text to write or replace.

**Type consistency:** Field names match across zod schema (Task 1), Keystatic schema (Task 3), JSON seed (Task 2), and Astro reads (Task 4):
- `seo.title`, `seo.description`
- `hero.eyebrow`, `hero.heading`, `hero.headingAmp`, `hero.sub`, `hero.ctaLabel`
- `services.eyebrow`, `services.items[].icon`, `.title`, `.body`
- `fit.eyebrow`, `fit.yesHeading`, `fit.yesItems[]`, `fit.noHeading`, `fit.noItems[]`
- `contact.heading`, `contact.sub`, `contact.namePlaceholder`, `contact.emailPlaceholder`, `contact.messagePlaceholder`, `contact.submitLabel`, `contact.fallbackEmail`

All present and consistent.
