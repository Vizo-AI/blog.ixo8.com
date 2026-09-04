# Vizo AI Blog Publishing Operator Manual

## Purpose

This runbook describes how to operate the article pipeline for
`https://ai-blog.ixo8.com/`.

The scheduled research process already creates this hierarchy in My Drive:

```text
AI Research Editor/
└── YYYY-MM/
    └── YYYY-MM-DD/
        ├── Canonical Article
        ├── Executive Brief
        ├── LinkedIn Concise
        ├── LinkedIn Full
        ├── Medium                 <- only this Google Doc is published
        ├── Short Summary
        ├── Sources + QA
        └── Teaser
```

The automation leaves that hierarchy and every source document unchanged. It
selects the Google Doc whose name is exactly `Medium`, exports it as Markdown,
formats and validates it locally, and opens a pull request. Publication remains
review-gated: the article does not reach the live site until the pull request is
reviewed and merged.

## Architecture

```text
Scheduled research process (Monday, Wednesday, Friday at 08:00 Eastern)
        |
        v
My Drive/AI Research Editor/YYYY-MM/YYYY-MM-DD/Medium
        |
        | Apps Script checks during the 08:00-08:40 Eastern window
        v
My Drive/AI Research Editor/Blog Pipeline/Blog Ready Markdown
        |
        | Google Drive for desktop
        v
Mirrored local folder on this Mac
        |
        | launchd runs at 08:05, :10, :15, :20, :25, :30, and :35
        | on Monday, Wednesday, and Friday
        v
Local importer -> format -> tests/check/build -> Git branch -> pull request
        |
        | human review and merge
        v
GitHub Actions -> GitHub Pages -> https://ai-blog.ixo8.com/
```

The repeated checks cover the normal 08:05-08:10 delivery time without running
the local job continuously. Both exporter and importer are idempotent, so later
checks harmlessly report that nothing new is waiting.

## Why this pipeline does not use gdown

`gdown` is useful for downloading public or link-shared Drive files, but it is a
poor fit for this private, unattended Google Docs workflow:

- private files generally require public link sharing or exported browser
  cookies;
- Google Docs are exported to Office formats by default rather than Markdown;
- the downloader does not express the dated folder traversal and exact
  `Medium`-only selection needed here;
- it would add Python and cookie/credential handling to a pipeline that already
  has an authenticated Google execution environment.

The Apps Script exporter uses the current Google user's OAuth grant and the
official Drive export endpoint for `text/markdown`. No Google credential, API
key, browser cookie, or folder ID is stored in this repository.

## Repository components

| Component | Responsibility |
| --- | --- |
| `ops/google-apps-script/export-blog-articles.gs` | Locate the dated `Medium` Doc and export it as Markdown |
| `ops/com.vizo.blog-importer.plist.example` | Run the local importer only during the M/W/F morning window |
| `scripts/import-drive-articles.mjs` | Normalize metadata, validate the site, and create a pull request |
| `scripts/import-drive-articles.test.mjs` | Test importer formatting and safety behavior |
| `.blog-publisher/state.json` | Record imported Drive IDs or content hashes to prevent duplicates |
| `.github/workflows/deploy.yml` | Validate pull requests and deploy merged changes to GitHub Pages |

The `.blog-publisher/` state/log directory and `.trace-mcp/` are ignored by Git.

## Publishing contract

Astro reads Markdown from `_posts`. The final filename is:

```text
YYYY-MM-DD-lowercase-url-slug.md
```

That becomes this URL shape:

```text
https://ai-blog.ixo8.com/YYYY/MM/DD/lowercase-url-slug/
```

The `Medium` Google Doc must begin with the real article title, preferably
formatted as Heading 1. The generic Google Doc name `Medium` is never used as
the article title. A recommended source document is:

```markdown
# Article title

The opening paragraph should be a concise description of the article.

## First section

Article content.

## Sources

- https://primary-source.example/report
- https://another-source.example/document
```

The importer emits frontmatter accepted by `src/content.config.ts`:

```yaml
---
title: "Article title"
date: 2026-09-04
description: "Short article description."
authors:
  - "Vizo AI"
topics: []
tags: []
sources:
  - "https://example.com/primary-source"
generated_with_ai: true
featured: false
---
```

It infers:

- `title` from frontmatter, then the first H1, then the source filename;
- `date` from frontmatter, then the `YYYY-MM-DD-` filename prefix, then the
  current date in `America/New_York`;
- `description` from frontmatter or the first prose paragraph;
- `sources` from frontmatter plus HTTP/HTTPS URLs in the article;
- `authors` as `Vizo AI` unless provided;
- `generated_with_ai` as `true` unless explicitly set to `false`;
- `featured` as `false` unless explicitly set to `true`.

The first H1 is removed from the body because the article layout renders the
frontmatter title as the page H1.

## One-time Google Drive setup

### 1. Create pipeline folders

Keep the existing dated folders. Add these operational folders, preferably
under `AI Research Editor/Blog Pipeline/`:

```text
AI Research Editor/
├── YYYY-MM/
│   └── YYYY-MM-DD/
│       └── Medium
└── Blog Pipeline/
    ├── Blog Ready Markdown/
    ├── Blog Imported Markdown/
    └── Blog Failed Markdown/
```

Only `Blog Ready Markdown` must be visible to Apps Script. The other two folders
are local destinations used by the importer after Drive for desktop syncs them.

Keep folder IDs private. A folder ID is the final identifier in its Drive URL;
do not put it in this repository, a pull request, a log, or a support message.

### 2. Install the Apps Script exporter

1. Open `https://script.google.com/` and create a standalone project named
   `Vizo Blog Exporter`.
2. Copy `ops/google-apps-script/export-blog-articles.gs` into the project.
3. Set the Apps Script project time zone to `America/New_York`.
4. Open **Project Settings > Script Properties**.
5. Add these two required properties using the private folder IDs:

   ```text
   AI_RESEARCH_EDITOR_ROOT_FOLDER_ID
   BLOG_READY_FOLDER_ID
   ```

   `AI_RESEARCH_EDITOR_ROOT_FOLDER_ID` is the ID of the existing
   `AI Research Editor` folder. `BLOG_READY_FOLDER_ID` is the ID of
   `Blog Ready Markdown`.

6. Optionally add this property if the source Doc is ever renamed:

   ```text
   BLOG_SOURCE_DOCUMENT_NAME=Medium
   ```

   The default is already `Medium`; exact spelling and capitalization are used.

7. Select `exportTodaysArticleNow` in the Apps Script editor and run it once.
8. Review and grant only the requested Google Drive and external-request
   permissions.
9. Confirm that one `.md` file appears in `Blog Ready Markdown`. Confirm that
   the original `Medium` Doc and all seven sibling documents remain unchanged.
10. Select and run `installPublishingWindowTrigger` once.

The installed Apps Script trigger wakes every five minutes because Apps Script
does not support a compact M/W/F 30-minute recurrence. The handler returns
immediately and performs no Drive lookup outside Monday, Wednesday, and Friday
from 08:00 through 08:40 Eastern. This is independent of the local `launchd`
schedule.

### 3. Configure Drive for desktop

Use **Mirror files** for the most predictable unattended behavior. If streaming
is required, mark `Blog Pipeline` as **Available offline** and keep Drive for
desktop running.

Record the absolute Finder paths for:

- `Blog Ready Markdown`;
- `Blog Imported Markdown`;
- `Blog Failed Markdown`.

Do not commit these user-specific paths.

## One-time local setup

### 1. Verify tools

From the repository root:

```bash
node --version
command -v node
command -v npm
command -v gh
npm ci
gh auth status
git status --short --branch
```

Requirements:

- Node.js 22.12 or newer;
- Google Drive for desktop running;
- GitHub CLI authenticated through the existing credential store;
- the repository on `main` with a clean working tree;
- local `main` able to fast-forward from `origin/main`.

Never paste a GitHub token into Apps Script, the launchd property list, the
repository, or a log file.

### 2. Test a dry run

Replace the examples with the absolute mirrored Drive paths:

```bash
npm run articles:import -- \
  --inbox "/absolute/path/to/Blog Ready Markdown" \
  --processed "/absolute/path/to/Blog Imported Markdown" \
  --failed "/absolute/path/to/Blog Failed Markdown" \
  --min-age-seconds 0 \
  --dry-run
```

A dry run reads and formats candidate files but does not write posts, change
Git, move Drive files, or update state.

### 3. Test a local import without publishing

```bash
npm run articles:import -- \
  --inbox "/absolute/path/to/Blog Ready Markdown" \
  --processed "/absolute/path/to/Blog Imported Markdown" \
  --failed "/absolute/path/to/Blog Failed Markdown"
```

This mode writes the article to `_posts`, runs `npm run check` and
`npm run build`, and moves a successful source file to
`Blog Imported Markdown`. Review and commit the post manually during testing.

### 4. Test pull-request publishing

Enable this only after the dry run and local import are proven:

```bash
npm run articles:import -- \
  --inbox "/absolute/path/to/Blog Ready Markdown" \
  --processed "/absolute/path/to/Blog Imported Markdown" \
  --failed "/absolute/path/to/Blog Failed Markdown" \
  --publish pr
```

In pull-request mode the importer:

1. requires a clean `main` branch;
2. runs `git pull --ff-only origin main`;
3. formats the article into `_posts`;
4. runs importer tests, Astro checks, the site build, route parity, and internal
   link validation;
5. creates an `automation/articles-<timestamp>` branch;
6. commits only generated `_posts` files;
7. pushes the branch and opens a pull request with `gh`;
8. switches the local checkout back to `main`;
9. moves the source Markdown to `Blog Imported Markdown`;
10. records the import in `.blog-publisher/state.json`.

It never pushes directly to `main` and never overwrites an existing article
with different content.

## Install the macOS schedule

This is a one-time machine-level action. Perform it only after all paths and the
pull-request test have been verified.

1. Create the repository-local state/log directory:

   ```bash
   mkdir -p .blog-publisher
   ```

2. Copy `ops/com.vizo.blog-importer.plist.example` to:

   ```text
   ~/Library/LaunchAgents/com.vizo.blog-importer.plist
   ```

3. Replace every placeholder in the copied file:

   ```text
   REPOSITORY_PATH
   DRIVE_READY_MARKDOWN_PATH
   DRIVE_IMPORTED_MARKDOWN_PATH
   DRIVE_FAILED_MARKDOWN_PATH
   TOOL_SHIMS_DIRECTORY
   ```

   Use absolute paths; do not use `~` in the property list. Set
   `TOOL_SHIMS_DIRECTORY` to the directory printed by:

   ```bash
   dirname "$(command -v node)"
   ```

   The importer also needs `npm`, `git`, and `gh` on the configured `PATH`.

4. Validate the installed file:

   ```bash
   plutil -lint ~/Library/LaunchAgents/com.vizo.blog-importer.plist
   ```

5. Load it:

   ```bash
   launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.vizo.blog-importer.plist
   ```

6. Run it immediately for first verification:

   ```bash
   launchctl kickstart -k "gui/$(id -u)/com.vizo.blog-importer"
   ```

7. Inspect the logs:

   ```bash
   tail -n 100 .blog-publisher/importer.log
   tail -n 100 .blog-publisher/importer.error.log
   ```

The checked-in schedule runs at 08:05, 08:10, 08:15, 08:20, 08:25, 08:30,
and 08:35 local time on Monday, Wednesday, and Friday. The Mac should use the
`America/New_York` time zone. If it uses another local time zone, adjust the
hours in the installed property list.

The Mac must be powered on, the user logged in, Drive for desktop running, and
the network available. macOS normally coalesces a missed calendar event after
wake, but it cannot import a file that Drive has not synchronized.

To unload the schedule:

```bash
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.vizo.blog-importer.plist
```

After changing the checked-in template, unload the installed job, update the
installed copy, validate it, and bootstrap it again.

## Normal Monday/Wednesday/Friday operation

1. At 08:00 Eastern, the research workflow starts creating the dated folder and
   its documents.
2. Apps Script looks only for
   `AI Research Editor/YYYY-MM/YYYY-MM-DD/Medium`.
3. When `Medium` is available, Apps Script reads the real title from the
   document and creates one dated Markdown file in `Blog Ready Markdown`.
4. Drive for desktop synchronizes the Markdown to the Mac.
5. The next scheduled local run imports and validates it.
6. Open the generated GitHub pull request.
7. Review the title, date, URL slug, opening description, headings, sources,
   article body, and Actions checks.
8. Adjust optional `topics`, `tags`, `featured`, or `generated_with_ai`
   metadata in the pull request if needed.
9. Merge the pull request when editorial review is complete.
10. Confirm the production GitHub Actions run succeeds, then open the article
    URL and its research record.

Do not merge if source metadata or article claims still need editorial review.

## Manual and recovery operations

### Import an already-created Markdown file

Place a UTF-8 `.md` file in `Blog Ready Markdown`. The importer accepts raw
Markdown or supported frontmatter and ignores dotfiles and non-Markdown files.
Files modified within the last 30 seconds are skipped to avoid importing a
partially synchronized file.

### Re-export today's Medium Doc

Run `exportTodaysArticleNow` in Apps Script. If that exact revision was already
exported, the execution reports `Already exported` and creates no duplicate.

If the `Medium` Doc changed after the first export, Apps Script detects the new
Drive modification timestamp. Remove or archive the earlier Markdown from
`Blog Ready Markdown` before running the function again because the output
filename intentionally remains stable.

### Recover a past date

1. Add this temporary Apps Script property:

   ```text
   BLOG_RECOVERY_DATE=YYYY-MM-DD
   ```

2. Run `exportRecoveryArticle` manually.
3. Confirm the correct Markdown appeared in `Blog Ready Markdown`.
4. Delete the `BLOG_RECOVERY_DATE` property so it cannot be reused by mistake.

The recovery function still selects only the exact `Medium` Google Doc.

### Run a local diagnostic

```bash
git status --short --branch
npm run test:articles
npm run check
npm run build
npm run articles:import -- \
  --inbox "/absolute/path/to/Blog Ready Markdown" \
  --dry-run \
  --min-age-seconds 0
```

## Required pull-request review checklist

- [ ] Headline and description are accurate.
- [ ] Filename slug is lowercase and readable.
- [ ] Publication date matches the dated Drive folder.
- [ ] No duplicate H1 appears in the article body.
- [ ] Section headings use `##` or deeper Markdown headings.
- [ ] Primary sources are present and open successfully.
- [ ] `generated_with_ai` is accurate.
- [ ] `featured` is intentional.
- [ ] GitHub Actions checks pass.
- [ ] No unrelated files are included in the pull request.

## Monitoring

Check these surfaces in order:

1. Apps Script **Executions**: confirms scheduled checks, export, or a useful
   waiting/error message.
2. `Blog Ready Markdown`: confirms Markdown creation and Drive synchronization.
3. `.blog-publisher/importer.log`: confirms import or a harmless empty scan.
4. `.blog-publisher/importer.error.log`: records validation, Git, or GitHub
   failures.
5. `Blog Failed Markdown`: contains rejected inputs and adjacent `.error.txt`
   explanations.
6. GitHub pull requests and Actions: confirms validation and deployment.

Normal idle messages include:

```text
Waiting: Medium is not available in YYYY-MM/YYYY-MM-DD.
Already exported: YYYY-MM/YYYY-MM-DD/Medium.
No Markdown articles are waiting in the inbox.
```

## Failure and recovery table

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| No dated folder found | Research workflow is late or date/time-zone is wrong | Inspect the research schedule and Apps Script project time zone; run today's export manually when ready |
| `Medium` is not found but sibling Docs exist | The document is late, renamed, or not a native Google Doc | Wait for completion; restore the exact name `Medium`, or deliberately set `BLOG_SOURCE_DOCUMENT_NAME` |
| More than one matching folder or Doc | Duplicate names make source selection ambiguous | Remove or rename the duplicate; the exporter intentionally refuses to guess |
| Export says the title is missing | The Doc begins with `Medium`, an empty line, or non-title content | Put the real article title first, preferably as Heading 1, then rerun |
| Markdown remains in `Blog Ready Markdown` | Drive is not synced, launchd is unloaded, or the Mac is offline | Verify Drive for desktop, run `launchctl kickstart`, and inspect importer logs |
| Source moves to `Blog Failed Markdown` | Invalid content/date, slug collision, or site validation failure | Read its `.error.txt`, correct the source, remove the error note, and return the corrected `.md` to `Blog Ready Markdown` |
| Importer reports a dirty tree | Local repository work is uncommitted | Review `git status`; commit or otherwise resolve intentional work before retrying |
| `git pull --ff-only` fails | Local and remote `main` diverged | Stop automation and reconcile manually; do not force-push |
| Importer names a recovery branch | Commit, push, or PR creation failed after branch creation | Inspect that branch and `git status`; finish or repair that exact branch before retrying |
| Pull-request checks fail | Frontmatter, route, link, or Astro build issue | Read the failed Actions step, fix the PR branch, and rerun checks |
| Pull request exists but article is not live | The PR is unmerged or deployment failed | Merge only after review, then inspect the Deploy to GitHub Pages workflow |
| The same source appears again | State was removed or the Doc changed after export | Compare the Drive file ID/content and `_posts`; the importer refuses a conflicting overwrite |

## Recover or remove a published article

Deleted posts remain recoverable from Git history. Locate a prior version without
changing the working tree:

```bash
git log --all -- _posts/path-to-article.md
git show COMMIT:_posts/path-to-article.md
```

To remove or roll back a published article, use a normal reviewed commit or a
Git revert and let the standard deployment run. Never force-push `main`.

## Security and access rules

- Never commit Google folder IDs, OAuth data, browser cookies, GitHub tokens,
  private keys, or `.env` files.
- Do not place secrets in article content, frontmatter, launchd arguments, or
  logs.
- Restrict `AI Research Editor` and `Blog Pipeline` to the smallest practical
  editor group.
- Treat the existence of the dated `Medium` Doc as authorization to prepare a
  publication pull request, not authorization to bypass editorial review.
- Keep pull-request mode enabled for unattended operation.
- Use the existing local GitHub credential store; do not embed credentials in
  automation files.
- Review changes to the importer, Apps Script, launchd template, and deploy
  workflow like production code.

## Updating the automation

After changing importer or schedule code, run:

```bash
npm run test:articles
npm run check
npm run build
plutil -lint ops/com.vizo.blog-importer.plist.example
node --check < ops/google-apps-script/export-blog-articles.gs
```

After changing Apps Script code, paste the reviewed version into the Apps Script
project and run `exportTodaysArticleNow` manually before relying on the scheduled
trigger. After changing the launchd template, reinstall and reload the local
copy as described above.

## Availability limitation

The local half of this pipeline depends on the Mac. If publishing must continue
while it is powered off, move the importer to an always-on service or a GitHub
Actions workflow with narrowly scoped Google authentication. Preserve the same
formatting, validation, idempotency, pull-request, and editorial-review gates.
Avoid long-lived service-account keys or broad personal-access tokens.

## Official references

- [Google Drive for desktop: stream and mirror files](https://support.google.com/drive/answer/13401938)
- [Google Drive API: export formats, including Markdown](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)
- [Google Drive API: search for files and folders](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Apps Script: installable and time-driven triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [gdown project documentation](https://github.com/wkentaro/gdown)
- [GitHub Actions workflow triggers](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows)
