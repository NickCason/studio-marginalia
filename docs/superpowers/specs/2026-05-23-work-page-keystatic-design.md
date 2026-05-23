# Work page → editable in Keystatic

**Status:** approved 2026-05-23
**Author:** Nick (with Claude)
**Audience:** any future engineer (or AI) implementing this; Nina, who will use the result

## Problem

`/work` (`src/pages/work/index.astro`) is the public-facing services + contact page. Every line of visible copy — hero heading, sub, four service cards, the yes/no fit lists, the contact section — is hardcoded in the Astro file. The Keystatic CMS currently has no `workPage` singleton, so Nina cannot edit any of this herself. About is already editable via an `aboutPage` singleton; Work is the only top-level page she can't touch.

Goal: give Nina full structured editing of the Work page through Keystatic, without changing the page's visual design or the URL.

## Constraints

- Must keep `/work/` looking identical on first deploy. Existing copy is migrated verbatim into the CMS-backed source.
- Must not touch `/preview/work/`, the hidden selected-work portfolio block, or the About page.
- Must follow the existing Keystatic patterns in `keystatic.config.tsx` (singletons + collections with `fields.*`) and the existing Astro content collection patterns in `src/content/config.ts` (zod schemas, single source of truth).
- The page is server-mode Astro with per-route `prerender = true`. That stays.

## Approach

Add a `workPage` Keystatic singleton stored as JSON at `src/content/pages/work.json`. Add a matching `workPage` Astro content collection (`type: 'data'`) in `src/content/config.ts` with a zod schema that mirrors the Keystatic schema. Rewrite `src/pages/work/index.astro` to load the entry via `getEntry('workPage', 'work')` and map every editable string into the existing JSX/HTML.

This is the same shape as the existing `now` and `site` singletons (structured JSON data, no markdown body) rather than the `aboutPage` shape (markdown with frontmatter) — chosen because the Work page is structured, not freeform prose.

### Schema (canonical — both Keystatic and zod mirror this)

```
workPage:
  seo:
    title              string  required
    description        string  required  (multiline)
  hero:
    eyebrow            string  required
    heading            string  required  (multiline; supports <br /> at author time as a literal newline)
    headingAmp         string  required  (italicized accent fragment shown inside <em class="amp">)
    sub                string  required  (multiline)
    ctaLabel           string  required
  services:
    eyebrow            string  required
    items[]            array (variable length) of:
      icon             enum    required  (curated Phosphor class name; see Icon list)
      title            string  required
      body             string  required  (multiline)
  fit:
    eyebrow            string  required
    yesHeading         string  required
    yesItems[]         array of string (variable length)
    noHeading          string  required
    noItems[]          array of string (variable length)
  contact:
    heading            string  required
    sub                string  required
    namePlaceholder    string  required
    emailPlaceholder   string  required
    messagePlaceholder string  required  (multiline)
    submitLabel        string  required
    fallbackEmail      string  required
```

The Keystatic UI groups these into four `fields.object(...)` blocks (Hero, Services, Fit, Contact) plus SEO so Nina sees a tidy sectioned form instead of a flat dump.

### Curated icon list

`select` field. Editor sees a friendly label; the value stored is the Phosphor class name applied to `<i class="ph-duotone ${value}">`. All names verified to exist in the Phosphor set already loaded by the site.

| Label             | Value                  |
| ----------------- | ---------------------- |
| Quote marks       | `ph-quotes`            |
| Pen nib           | `ph-pen-nib`           |
| Calendar          | `ph-calendar-blank`    |
| Flame             | `ph-flame`             |
| Notebook          | `ph-notebook`          |
| Compass           | `ph-compass`           |
| Feather           | `ph-feather`           |
| Star              | `ph-star`              |
| Moon              | `ph-moon`              |
| Sparkle           | `ph-sparkle`           |
| Sun (dim)         | `ph-sun-dim`           |
| Leaf              | `ph-leaf`              |
| Heart             | `ph-heart`             |
| Coffee            | `ph-coffee`            |
| Envelope          | `ph-envelope-simple`   |
| Megaphone (soft)  | `ph-megaphone-simple`  |
| Lightbulb         | `ph-lightbulb`         |
| Bookmark          | `ph-bookmark-simple`   |

Default: `ph-quotes`.

### Why JSON, not markdown frontmatter

Work has no freeform body — it's all structured sections with arrays. Using `fields.object` + JSON storage matches Keystatic's pattern for the existing `now`, `site`, and `noticing` singletons. Markdown frontmatter would either leave an orphan empty body or invite Nina to write prose into a place that has no rendering pipeline. JSON is the honest fit.

### Why a separate `workPage` collection, not an entry in `pages`

The existing `pages` collection has `type: 'content'` (markdown body required) and a schema with `title` + `dek`. Forcing Work into that schema would require either converting `pages` to a discriminated union or duplicating the `about` shape. About already works; converting it is unrelated churn. A new sibling `workPage` collection is cleaner and matches Keystatic's `singletons` API ergonomically.

## Rendering changes (`src/pages/work/index.astro`)

- Load the singleton at the top of the frontmatter:
  ```ts
  const entry = await getEntry('workPage', 'work');
  if (!entry) throw new Error('Missing src/content/pages/work.json');
  const { seo, hero, services, fit, contact } = entry.data;
  ```
- `<Base title={seo.title} description={seo.description}>` — values come from the CMS.
- Hero: replace the literal strings for eyebrow, heading, italicized amp, sub, and CTA label. The hero `<h1>` is rendered as `{hero.heading}<br /><em class="amp">{hero.headingAmp}</em>.` — the `<br />` and the trailing period are emitted unconditionally by the template, so Nina edits two clean text fields without authoring HTML or punctuation. (The current `Quiet marketing for the patient, / and the patiently impatient.` reads correctly under this rule because the comma lives at the end of `hero.heading`.)
- Services: `{services.items.map(item => …)}` rendering one `.card` per entry; icon is `<i class={\`ph-duotone ${item.icon}\`} />`.
- Fit: `{fit.yesItems.map(…)}` and `{fit.noItems.map(…)}`. The `ph-check-circle` / `ph-x-circle` icons stay hardcoded because they encode the yes/no semantic and aren't authorial choice.
- Contact: heading, sub, placeholders, and submit label flow from CMS. The Formspree env-var logic (`PUBLIC_FORMSPREE_ENDPOINT`) and the `mailto:` fallback are unchanged; only the displayed strings come from the CMS. `fallbackEmail` is the address used in both the displayed link and its `mailto:` href.
- `export const prerender = true;` stays.

No CSS changes. No new components. The HTML structure of every section is preserved, so all existing styles in the page's `<style>` block continue to apply.

## Initial seed file

A `src/content/pages/work.json` is checked in with the current production copy verbatim, including:
- 4 service items (Brand voice & messaging, Content strategy, Campaign concepts & copy, Slow retainers) with their current icons
- 4 yes-items and 4 no-items in the fit section, current wording
- Hero, contact, and SEO strings matching today's page

This guarantees byte-identical rendered output on first deploy.

## Validation & error handling

- The zod schema in `src/content/config.ts` is the build-time enforcer; if Nina commits an invalid JSON the Astro build fails with a typed error.
- Keystatic's UI enforces required fields at authoring time.
- The `icon` field is `z.string()` in zod (not an enum) so adding a new icon to Keystatic's curated list doesn't require a coordinated zod change. Keystatic's select is the user-facing constraint.
- Arrays use `z.array(...).default([])` so an empty array renders an empty grid rather than throwing.
- Missing entry on build throws an explicit error pointing at `src/content/pages/work.json`.

## Out of scope (explicitly)

- The hidden selected-work / portfolio tiles block in the Work page CSS — stays hidden, not surfaced to the CMS.
- `/preview/work/` route — untouched.
- The About page schema, content, or rendering.
- Theme tokens, layout components, navigation, or anything outside the Work page.
- A generic "any page" CMS feature.

## Testing

- `pnpm build` succeeds with the new JSON seed (zod validates schema).
- `pnpm dev` then visit `/work/`; visually compare to the current production page — must be identical.
- `pnpm dev` then visit `/keystatic/`; under "Site state" there is a new "Work page" entry. Open it; confirm all four section objects render, service items are an editable array with the icon dropdown working, yes/no lists are editable arrays.
- Edit one service card title in Keystatic local mode, save, and confirm the Astro dev server hot-reloads with the new copy.
- Existing Vitest and Playwright suites continue to pass; no new tests required because the change is a pure pass-through of strings with no new logic.

## Files touched

- `keystatic.config.tsx` — add `workPage` singleton; add it to the `'Site state'` navigation group between `site` and `aboutPage`.
- `src/content/config.ts` — add `workPage` data collection with the mirrored zod schema; export from `collections`.
- `src/content/pages/work.json` — new file, seeded with current copy.
- `src/pages/work/index.astro` — replace hardcoded strings with CMS reads; no CSS or structural changes.

## Decisions log

- **JSON over markdown** — chosen because Work has no body; matches `now`/`site`/`noticing` pattern.
- **Curated icon dropdown** — chosen over free-text Phosphor class name to prevent typos silently breaking icons; chosen over removing icons because the duotone glyphs are part of the brand.
- **Variable-length arrays** — chosen for services and yes/no lists; CSS already handles 1–6 cards gracefully and gives Nina real authorship.
- **All eyebrows + CTA editable** — consistent with the "all structured fields" decision; defaults seeded to today's copy so nothing visibly changes.
- **Portfolio block untouched** — explicit decision to keep blast radius minimal; the selected-work launch is a separate piece of work.
