# Vizo AI Blog — Production Rebuild Implementation Plan

## 1. Product direction

The site should become a **dark cinematic AI research publication** rather than a conventional personal blog.

It has four simultaneous product goals:

1. exceptional long-form reading experience
2. searchable research knowledge base
3. newsletter/media publication
4. interactive AI-powered research experience

The correct foundation is **Astro**, not a heavily customized Jekyll theme and not a full Next.js application.

Astro keeps the publication static-first while allowing interactive islands or server-backed features only where they add real value.

## 2. Repository and current state

Repository:

`Vizo-AI/blog.ixo8.com`

Production domain:

`https://ai-blog.ixo8.com`

Current production branch:

`main`

Current production technology:

Jekyll + Minima

Migration branch already created:

`agent/astro-production-rebuild`

Draft pull request already created:

PR #1 — **Rebuild publication foundation with Astro**

The branch was created from the current `main` state. The earlier implementation added 12 Astro migration files without deleting the Jekyll implementation, keeping rollback easy.

A Vercel preview/build succeeded for the Astro branch. The previous environment could not independently run a local dependency installation/build because outbound GitHub resolution was unavailable.

The local ChatGPT continuation should therefore independently validate the project on the user's machine.

## 3. Work already implemented

The migration branch already contains the initial Astro foundation, including:

- `astro.config.mjs`
- `package.json`
- `tsconfig.json`
- `src/content.config.ts`
- `src/layouts/BaseLayout.astro`
- `src/pages/index.astro`
- `src/pages/explore.astro`
- `src/pages/about.astro`
- `src/pages/404.astro`
- `src/pages/[year]/[month]/[day]/[slug].astro`
- `src/styles/global.css`
- `vercel.json`

The implementation was intentionally additive. Jekyll files were retained until Astro is fully validated.

### Existing publishing contract

A separate automated publisher commits articles directly to:

`_posts/YYYY-MM-DD-slug.md`

and computes public URLs as:

`https://ai-blog.ixo8.com/YYYY/MM/DD/slug/`

The Astro migration is designed to read the existing `_posts` content instead of forcing an immediate change to that publisher.

This compatibility boundary should be preserved until the site and pipeline are verified end-to-end.

## 4. Hosting recommendation after dropping Vercel

Vercel is no longer necessary for this project if the user prefers a GitHub-native static deployment.

Recommended production architecture:

```text
Automated publisher
      |
      v
GitHub repository / _posts
      |
      v
Astro static build
      |
      v
Pagefind static index
      |
      v
GitHub Actions
      |
      v
GitHub Pages
      |
      v
ai-blog.ixo8.com
```

For a custom GitHub Pages domain:

- set Astro `site` to `https://ai-blog.ixo8.com`
- do not use a repository `base` path
- add `public/CNAME` containing `ai-blog.ixo8.com`
- deploy with the official Astro GitHub Pages action
- configure GitHub Pages source to **GitHub Actions**

Before implementing, verify the current official action versions in Astro's documentation.

## 5. Migration strategy

### Phase A — Validate locally

Before significant feature work:

- inspect branch/diff
- install dependencies
- generate/commit lockfile if absent
- run Astro checks
- run production build
- run local dev server
- run static production preview
- verify Pagefind indexing
- inspect homepage, Explore, About, article and 404
- test desktop and mobile

Any existing migration errors should be repaired before expanding scope.

### Phase B — GitHub Pages deployment

Replace the temporary Vercel deployment configuration with GitHub Pages.

Work items:

- remove `vercel.json`
- remove unused Vercel-specific dependencies/adapters, if any
- confirm static Astro output
- configure `site`
- add `public/CNAME`
- add `.github/workflows/deploy.yml`
- ensure the deploy workflow runs Pagefind indexing as part of the build
- ensure a lockfile exists for deterministic CI
- configure repository Pages source to GitHub Actions
- confirm custom domain and HTTPS

### Phase C — URL parity

Preserve every existing public article URL.

Create a check that maps `_posts/YYYY-MM-DD-slug.md` to expected generated paths such as:

`dist/YYYY/MM/DD/slug/index.html`

No article should move simply because the frontend framework changed.

## 6. Design system

### Creative direction

**Dark cinematic — AI research lab**

Reference feeling:

- intelligence terminal
- premium editorial publication
- modern research lab
- restrained cinematic atmosphere

Avoid:

- generic purple-gradient AI branding
- overused glass cards
- uncontrolled neon
- permanent animated backgrounds
- overly dense dashboard layouts

### Visual principles

Use:

- near-black graphite backgrounds
- subtly differentiated surface levels
- editorial serif or highly readable long-form face for article prose
- clean sans-serif for navigation/UI
- monospace only for technical metadata
- one restrained accent family
- generous whitespace
- deliberate typography scale
- subtle transition/motion

The interface should feel premium primarily because of hierarchy, spacing and typography.

## 7. Homepage information architecture

Suggested navigation:

`Vizo AI | Explore | Topics | About | Search | Subscribe`

Search should also support `Cmd/Ctrl + K`.

Homepage structure:

1. concise editorial proposition
2. Featured Intelligence story
3. Latest Intelligence stream
4. Topics
5. Research Signals / shorter observations, when content volume supports it
6. Briefing newsletter module

Featured story metadata can include:

- topic
- headline
- deck
- published date
- reading time
- source count

Avoid a grid of generic blog cards.

## 8. Article experience

The article page is the highest-priority design surface.

Recommended content width:

approximately 65–72 characters per line.

Article hierarchy:

```text
topic / published date / reading time

headline

deck / summary

source / verification metadata

article body

sources and methodology
related intelligence
newsletter
ask this article
```

Potential enhancements:

- subtle reading progress bar
- sticky desktop table of contents
- responsive tables
- strong code-block treatment
- captions and provenance for images
- automatic heading navigation
- related articles
- optional distraction-reduced reading mode

## 9. Knowledge-base layer

`/explore/` should become the research discovery interface rather than merely an archive.

Start with Pagefind because the publication is static and Pagefind can index the final generated HTML.

Search features:

- full-text search
- topic filtering
- date filtering
- article type filtering later
- relevance/newest sorting
- keyboard navigation
- matched-passage highlighting

Pagefind's generated UI assets should not dictate the visual design. Build a custom publication-native interface over the search data.

## 10. Structured content schema

Gradually evolve frontmatter toward:

```yaml
title:
description:
date:
updated:
slug:
topics:
tags:
authors:
hero:
hero_alt:
sources:
source_count:
fact_checked_at:
editorial_status:
generated_with_ai:
featured:
```

The Astro schema should provide backwards-compatible defaults so existing articles remain buildable.

Do not update the publisher to require all fields until the website schema is stable.

## 11. Editorial trust and factual validation

This is a core product requirement.

The site publishes automated research/content, so increased visual authority must be accompanied by increased evidence transparency.

Priority features:

- source lists
- source count
- publication and update timestamps
- AI-assisted disclosure
- methodology page
- AI use policy
- corrections policy
- clear contact route

The upstream publishing pipeline should eventually validate important factual entities and claims before publishing, including:

- named people and companies
- dates
- monetary amounts
- percentages
- quotations
- policy claims
- causal explanations
- studies/reports

If a high-confidence factual verification cannot be obtained, the publishing system should fail closed rather than invent an explanation.

## 12. SEO and distribution

Implement:

- canonical URLs
- page descriptions
- Open Graph tags
- social cards
- Article structured data
- author/organization structured data
- sitemap
- RSS
- robots.txt
- topic landing pages

Every article should have a consistent social preview rather than depending on an arbitrary browser screenshot.

## 13. Newsletter

Newsletter should come after the core static publication is stable.

Desired UX:

- branded site-native form
- header/home/article-footer placements
- double opt-in
- clear success/error states
- unsubscribe/provider mechanics handled behind the interface

Keep newsletter delivery decoupled from the article publishing job. A newsletter provider failure must never prevent an article from publishing.

## 14. AI features

AI is deliberately later in the plan.

### First: Ask This Article

The user asks questions about the current article.

Requirements:

- article content and article sources are primary context
- answers cite supporting passages/material
- generated synthesis is clearly distinguished from published facts
- missing evidence is acknowledged
- anonymous usage is rate-limited

### Later: Ask the Archive

Search across the publication corpus.

Start with existing search retrieval before introducing embeddings or a vector database.

Only add semantic/vector infrastructure if measured retrieval quality shows a real need.

## 15. Production quality criteria

### Performance targets

For core static pages:

- Lighthouse Performance >= 95
- Accessibility >= 95
- Best Practices >= 95
- SEO >= 95
- LCP < 2.5 seconds
- CLS < 0.1
- INP < 200 ms

### Accessibility

Require:

- complete keyboard navigation
- visible focus states
- WCAG AA contrast
- semantic heading order
- skip navigation
- reduced-motion support
- screen-reader labels
- responsive and accessible tables
- image alt text

### Responsive QA

Test at minimum:

- 320 px
- common phone widths
- tablet
- laptop
- wide desktop

Long-form typography must be deliberately tested at every size.

## 16. Testing and release

Before merging the migration PR:

- clean dependency installation succeeds
- production build succeeds
- Pagefind index is produced
- all existing article URLs are present
- internal links are valid
- search works
- article tables render correctly
- responsive QA passes
- accessibility baseline passes
- GitHub Pages workflow succeeds
- custom domain serves the Astro build

Keep the original Jekyll `main` state available as the rollback point until the Astro deployment is confirmed.

After production validation, remove obsolete Jekyll implementation files in a dedicated cleanup commit/PR rather than mixing deletion into initial deployment troubleshooting.

## 17. Recommended immediate next milestone

The next work session should focus on only these outcomes:

1. independently build and run the existing Astro migration locally
2. fix all migration defects
3. replace Vercel deployment with GitHub Pages
4. establish URL parity tests
5. visually QA homepage, article, Explore, About and mobile
6. deploy the migration safely

Only after these are green should the implementation move into richer content metadata, trust/provenance, newsletter and AI interactions.

## 18. Decision rule

The weakest assumption in this architecture is that the site will genuinely grow into a searchable research publication with interactive research features.

If the project later becomes only a lightweight chronological Markdown blog, Jekyll is simpler.

Given the stated goals, Astro remains the recommended architecture because it provides the better long-term balance of static performance, editorial flexibility and selective interactivity.
