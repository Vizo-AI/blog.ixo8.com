# Vizo AI Blog Publishing Runbook

## Purpose

This runbook describes how to operate the Vizo AI article pipeline from Google Drive to `https://ai-blog.ixo8.com/`.

The pipeline is deliberately review-gated:

```text
Google Docs or Markdown
        |
        v
Google Drive: Blog Inbox
        |
        v
Apps Script exports native Docs to Markdown
        |
        v
Google Drive: Blog Ready Markdown
        |
        v
Drive for desktop syncs the Markdown to this Mac
        |
        v
Local importer formats and validates the article
        |
        v
Git branch + pull request
        |
        v
Human review and merge to main
        |
        v
GitHub Actions deploys GitHub Pages
```

Moving a document into **Blog Inbox** is the editorial “ready for publication” signal. Do not put drafts in that folder.

## Components

| Component | Responsibility |
| --- | --- |
| Google Drive folders | Separate incoming, exported, processed, and failed files |
| `ops/google-apps-script/export-blog-articles.gs` | Export native Google Docs to Markdown every five minutes |
| Google Drive for desktop | Make exported Markdown available as local files |
| `scripts/import-drive-articles.mjs` | Normalize article names/frontmatter and run site validation |
| `ops/com.vizo.blog-importer.plist.example` | Run the importer every five minutes on macOS |
| `.blog-publisher/state.json` | Record imported Drive IDs or content hashes to prevent duplicates |
| `.github/workflows/deploy.yml` | Build pull requests and deploy pushes to `main` |

The state directory, logs, and `.trace-mcp/` are ignored by Git.

## Publishing contract

Astro reads Markdown from `_posts`. A post filename must be:

```text
YYYY-MM-DD-lowercase-url-slug.md
```

That filename becomes:

```text
https://ai-blog.ixo8.com/YYYY/MM/DD/lowercase-url-slug/
```

The importer produces frontmatter accepted by `src/content.config.ts`:

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

The importer infers:

- `title` from frontmatter, then the first `#` heading, then the source filename;
- `date` from frontmatter, then a `YYYY-MM-DD-` filename prefix, then the current date in `America/New_York`;
- `description` from frontmatter or the first prose paragraph;
- `sources` from frontmatter plus HTTP/HTTPS URLs in the article;
- `authors` as `Vizo AI` unless provided;
- `generated_with_ai` as `true` unless explicitly set to `false`;
- `featured` as `false` unless explicitly set to `true`.

The first H1 is removed from the body because the article layout already renders the frontmatter title as the page H1.

## One-time Google Drive setup

### 1. Create the folders

Create these folders under one restricted-access Drive folder:

```text
Vizo Blog/
├── Blog Inbox/
├── Blog Ready Markdown/
├── Blog Processed Docs/
├── Blog Imported Markdown/
└── Blog Failed Markdown/
```

Use **Blog Inbox** for native Google Docs. An already-created `.md` file may be placed directly in **Blog Ready Markdown**.

Keep the folder IDs private. A folder ID is the final identifier in its Drive URL; do not put it in this repository, a pull request, or a support message.

### 2. Install the Apps Script exporter

1. Open `https://script.google.com/` and create a standalone project named `Vizo Blog Exporter`.
2. Copy the contents of `ops/google-apps-script/export-blog-articles.gs` into the project.
3. Set the Apps Script project time zone to `America/New_York`.
4. Open **Project Settings > Script Properties**.
5. Add these properties using the corresponding private folder IDs:

```text
BLOG_INBOX_FOLDER_ID
BLOG_READY_FOLDER_ID
BLOG_PROCESSED_DOCS_FOLDER_ID
```

6. Run `exportReadyArticles` once from the Apps Script editor.
7. Review and grant only the requested Google Drive and external-request permissions.
8. Put a test Google Doc in **Blog Inbox** and run `exportReadyArticles` again.
9. Confirm that a `.md` file appears in **Blog Ready Markdown** and the source Doc moves to **Blog Processed Docs**.
10. Run `installFiveMinuteTrigger` once.

The Apps Script uses the current user's Google OAuth grant. It does not contain or require a pasted API key. Native Google Docs are exported through the Drive API as `text/markdown`.

### 3. Configure Drive for desktop

For the most predictable unattended behavior, use **Mirror files** for My Drive. If streaming is required, mark the Vizo Blog folder as **Available offline** and keep Drive for desktop running.

Record the absolute Finder paths for:

- Blog Ready Markdown
- Blog Imported Markdown
- Blog Failed Markdown

Do not commit those user-specific paths to Git.

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
- the repository checked out on `main` with a clean working tree;
- local `main` able to fast-forward from `origin/main`.

Never paste a GitHub token into the Apps Script, launchd property list, repository, or log file.

### 2. Exercise a dry run

Replace the example paths with the absolute mirrored Drive paths:

```bash
npm run articles:import -- \
  --inbox "/absolute/path/to/Blog Ready Markdown" \
  --processed "/absolute/path/to/Blog Imported Markdown" \
  --failed "/absolute/path/to/Blog Failed Markdown" \
  --min-age-seconds 0 \
  --dry-run
```

A dry run reads and formats candidate files but does not write posts, change Git, move Drive files, or update state.

### 3. Exercise a local import without Git publishing

```bash
npm run articles:import -- \
  --inbox "/absolute/path/to/Blog Ready Markdown" \
  --processed "/absolute/path/to/Blog Imported Markdown" \
  --failed "/absolute/path/to/Blog Failed Markdown"
```

This mode writes the formatted article to `_posts`, runs `npm run check` and `npm run build`, and moves a successful source file to **Blog Imported Markdown**. Review and commit the resulting post manually.

### 4. Exercise pull-request publishing

Only enable this after the dry run and local import are proven:

```bash
npm run articles:import -- \
  --inbox "/absolute/path/to/Blog Ready Markdown" \
  --processed "/absolute/path/to/Blog Imported Markdown" \
  --failed "/absolute/path/to/Blog Failed Markdown" \
  --publish pr
```

In PR mode the importer:

1. requires a clean `main` branch;
2. runs `git pull --ff-only origin main`;
3. writes and validates the article;
4. creates an `automation/articles-<timestamp>` branch;
5. commits only the generated `_posts` files;
6. pushes the branch;
7. opens a pull request with `gh`;
8. switches the local checkout back to `main`;
9. moves the source Markdown to **Blog Imported Markdown**;
10. records the import in `.blog-publisher/state.json`.

The importer never pushes directly to `main` and never overwrites an existing article with different content.

## Install the macOS schedule

This step writes outside the repository and should be performed by the Mac operator after verifying all paths.

1. Create the local log/state directory:

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

Use absolute paths. Do not use `~` in the property list. Set `TOOL_SHIMS_DIRECTORY` to the directory printed by `dirname "$(command -v node)"`. On a machine managed by mise, for example, this is normally the user's mise `shims` directory. The importer also needs `npm`, `git`, and `gh` to be reachable through the configured `PATH`.

4. Validate the file:

```bash
plutil -lint ~/Library/LaunchAgents/com.vizo.blog-importer.plist
```

5. Load it:

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.vizo.blog-importer.plist
```

6. Run it immediately for the first verification:

```bash
launchctl kickstart -k "gui/$(id -u)/com.vizo.blog-importer"
```

7. Inspect the logs:

```bash
tail -n 100 .blog-publisher/importer.log
tail -n 100 .blog-publisher/importer.error.log
```

The Mac must be powered on, the user must be logged in, Drive for desktop must be running, and the network must be available. A sleeping Mac processes the job after it wakes.

To unload the schedule temporarily:

```bash
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.vizo.blog-importer.plist
```

## Standard operating procedure

### Authoring a native Google Doc

Use this structure:

```markdown
# Article title

The opening paragraph should be a concise description of the article.

## First section

Article content.

## Sources

- https://primary-source.example/report
- https://another-source.example/document
```

Operational steps:

1. Finish editing and source review outside **Blog Inbox**.
2. Use Markdown-style headings in the Google Doc.
3. Include primary-source URLs in the article.
4. Move the final document into **Blog Inbox**.
5. Wait up to five minutes for Apps Script export.
6. Wait up to five additional minutes for local import.
7. Open the generated GitHub pull request.
8. Review the title, date, description, URL slug, body headings, source list, and Actions checks.
9. Adjust optional `topics`, `tags`, `featured`, or `generated_with_ai` metadata in the PR when necessary.
10. Merge the pull request.
11. Confirm the production GitHub Actions run succeeds.
12. Open the new article URL and verify the article and research record.

Do not merge if source metadata or the article's claims still need editorial review.

### Publishing a Markdown file directly

Place a UTF-8 `.md` file in **Blog Ready Markdown**. The file may be raw Markdown or already contain supported frontmatter. The importer ignores dotfiles and non-Markdown files.

Files modified within the last 30 seconds are skipped until a later run so partially synchronized files are not imported.

## Required review checklist

- [ ] Headline and description are accurate.
- [ ] Filename slug is lowercase and readable.
- [ ] Publication date is correct.
- [ ] No duplicate H1 appears in the article body.
- [ ] Section headings use `##` or deeper Markdown headings.
- [ ] Primary sources are present and open successfully.
- [ ] `generated_with_ai` is accurate.
- [ ] `featured` is intentionally selected.
- [ ] GitHub Actions checks pass.
- [ ] No unrelated files are included in the pull request.

## Monitoring

Check these surfaces in order:

1. Apps Script **Executions**: confirms Doc export and trigger health.
2. **Blog Ready Markdown**: confirms Markdown creation and Drive sync.
3. `.blog-publisher/importer.log`: confirms import or a harmless empty scan.
4. `.blog-publisher/importer.error.log`: records validation, Git, or GitHub failures.
5. **Blog Failed Markdown**: contains rejected source files and adjacent `.error.txt` explanations.
6. GitHub pull requests and Actions: confirms validation and deployment.

The normal idle message is:

```text
No Markdown articles are waiting in the inbox.
```

## Failure and recovery

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| Doc remains in Blog Inbox | Apps Script trigger, permissions, or folder properties | Inspect Apps Script Executions; verify the three Script Properties without exposing their values |
| Markdown remains in Blog Ready Markdown | Drive is not synced, launchd is unloaded, or the Mac is offline | Verify Drive for desktop, run `launchctl kickstart`, and inspect importer logs |
| Source moves to Blog Failed Markdown | Invalid date/body, slug collision, or site validation failure | Read its `.error.txt`, correct the source, remove the error note, and move the corrected `.md` back to Blog Ready Markdown |
| Importer reports a dirty tree | Local repository work is uncommitted | Review `git status`; commit or otherwise resolve intentional work before retrying |
| `git pull --ff-only` fails | Local and remote `main` diverged | Stop automation and reconcile the branch manually; do not force-push |
| Importer names a recovery branch | Commit, push, or PR creation failed after branch creation | Inspect that branch and `git status`; finish or repair that exact branch before retrying |
| Pull request checks fail | Frontmatter, route, link, or Astro build issue | Read the failed Actions step, fix the PR branch, and rerun checks |
| Pull request exists but article is not live | PR is unmerged or production deployment failed | Merge only after review, then inspect the Deploy to GitHub Pages workflow |
| Same content appears again | State was removed or source changed | Compare Drive file ID/content and `_posts`; the importer refuses a conflicting overwrite |

### Run a manual diagnostic

```bash
git status --short --branch
npm run test:articles
npm run check
npm run build
npm run articles:import -- --inbox "/absolute/path/to/Blog Ready Markdown" --dry-run --min-age-seconds 0
```

### Recover an article from Git history

Deleted posts remain recoverable from earlier Git commits. Locate the prior version without changing the working tree:

```bash
git log --all -- _posts/path-to-article.md
git show COMMIT:_posts/path-to-article.md
```

### Roll back a production publication

Use a normal Git revert of the merge or publication commit, review it, and push the revert through the standard workflow. Never force-push `main`.

## Security and access rules

- Never commit Google folder IDs, OAuth data, GitHub tokens, private keys, or `.env` files.
- Do not place secrets in article frontmatter, Markdown, launchd arguments, or logs.
- Restrict the Vizo Blog Drive folder to the smallest practical editor group.
- Treat moving a file into Blog Inbox as authorization to prepare a publication PR, not authorization to bypass editorial review.
- Keep PR mode enabled for unattended operation.
- Review changes to the importer, Apps Script, launchd template, and deploy workflow like production code.
- Use the existing local GitHub credential store; do not embed credentials in automation files.

## Updating the automation

After changing importer code:

```bash
npm run test:articles
npm run check
npm run build
plutil -lint ops/com.vizo.blog-importer.plist.example
```

After changing Apps Script code, paste the reviewed version into the Apps Script project and run `exportReadyArticles` manually with one test document before relying on the scheduled trigger.

## Future always-on option

The local pipeline depends on this Mac. If publishing must continue while it is powered off, move ingestion to an always-on service or a GitHub Actions workflow authenticated to Google through a narrowly scoped workload identity. Preserve the same formatting, validation, idempotency, PR, and human-review gates. Avoid introducing a long-lived Google service-account key or broad GitHub personal-access token unless there is no safer alternative.

## Official references

- [Google Drive for desktop: stream and mirror files](https://support.google.com/drive/answer/13401938)
- [Google Drive API: export formats, including Markdown](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)
- [Apps Script: installable and time-driven triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Google Drive API: resource-change notifications](https://developers.google.com/workspace/drive/api/guides/push)
- [GitHub Actions workflow triggers](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows)
