# Vizo AI Blog Publishing Operator Manual

## Purpose

This runbook operates the automated publishing path for
`https://ai-blog.ixo8.com/` without Google Drive for desktop or an always-on Mac.

The research workflow creates this Drive hierarchy:

```text
My Drive/
└── AI Research Editor/
    └── YYYY-MM/
        └── YYYY-MM-DD/
            ├── Canonical Article
            ├── Executive Brief
            ├── LinkedIn Concise
            ├── LinkedIn Full
            ├── Medium                 <- only this native Google Doc is used
            ├── Short Summary
            ├── Sources + QA
            └── Teaser
```

The source may appear as `Medium.gdoc` on a computer. A `.gdoc` file is only a
local pointer to a native Google Doc; it does not contain the article body. The
automation does not download that pointer. Apps Script opens the native Google
Doc in Drive and exports its actual content to Markdown in memory.

## Architecture

```text
Scheduled research process (Monday, Wednesday, Friday at 08:00 Eastern)
        |
        v
My Drive/AI Research Editor/YYYY-MM/YYYY-MM-DD/Medium
        |
        | Apps Script finds the native Google Doc and exports text/markdown
        v
GitHub repository_dispatch event carrying the Markdown
        |
        v
GitHub Actions creates a temporary Markdown inbox
        |
        v
Existing importer formats and validates the article
        |
        v
automation/articles-* branch and review pull request
        |
        | human review and merge
        v
GitHub Pages deployment
```

There is no `Blog Ready Markdown` Drive folder, Drive desktop configuration,
local `launchd` job, or `gdown` dependency in this design.

## What each identifier means

Only one Google folder ID is required:

```text
AI_RESEARCH_EDITOR_ROOT_FOLDER_ID
```

This is the permanent ID of the existing `AI Research Editor` parent folder.
The ID does not change when new `YYYY-MM` and `YYYY-MM-DD` children are created.
Apps Script calculates today's names and traverses them automatically:

```text
AI Research Editor        <- permanent ID supplied once
└── 2026-09               <- found by name
    └── 2026-09-04        <- found by name
        └── Medium        <- exact native Google Doc found by name and MIME type
```

To find the permanent folder ID, open `AI Research Editor` in the Drive browser.
The folder ID is the value after `/folders/` in the URL. Treat it as private
configuration and enter it only in Apps Script Project Settings.

`BLOG_READY_FOLDER_ID` is no longer used.

## Repository components

| Component | Responsibility |
| --- | --- |
| `ops/google-apps-script/export-blog-articles.gs` | Find, export, and dispatch the dated `Medium` Doc |
| `.github/workflows/import-drive-article.yml` | Receive the article and run the cloud importer |
| `scripts/prepare-dispatch-article.mjs` | Validate and decode the external dispatch payload |
| `scripts/import-drive-articles.mjs` | Create frontmatter, validate the site, and open the PR |
| `scripts/*.test.mjs` | Test export scheduling, payload safety, and formatting |
| `.github/workflows/deploy.yml` | Validate pull requests and deploy merged posts |

## Security model

The bridge requires one fine-grained GitHub personal access token. Create it for
a dedicated publishing identity if one is available. Limit it to the single
`Vizo-AI/blog.ixo8.com` repository with:

- **Contents: Read and write**;
- **Pull requests: Read and write**.

Use an expiration date and rotate it before expiry. Never paste the token into
the repository, article, issue, pull request, log, chat, or support message.

The same token is entered manually in two protected locations:

1. GitHub repository Actions secret named `BLOG_PUBLISHER_GITHUB_TOKEN`;
2. Apps Script Script Property named `GITHUB_DISPATCH_TOKEN`.

The first authorizes the temporary GitHub runner to push the article branch and
open its PR. The second authorizes Apps Script to trigger only the repository's
intake workflow. Keep the Apps Script project private and restrict its editors.

For a larger production system, replace the personal token with a narrowly
scoped GitHub App installation token. The fine-grained token is the simpler
operator-managed starting point.

## One-time GitHub setup

1. Create the fine-grained token described above without placing it in a local
   file.
2. Open the repository on GitHub.
3. Go to **Settings > Secrets and variables > Actions**.
4. Create a repository secret named:

   ```text
   BLOG_PUBLISHER_GITHUB_TOKEN
   ```

5. Paste the token value into GitHub's secret form and save it.
6. Confirm that Actions are enabled for the repository.

Do not add this token to a Codespace variable or ordinary Actions variable. It
must be a secret.

## One-time Apps Script setup

1. Open `https://script.google.com/` and create a standalone project named
   `Vizo Blog Exporter`.
2. Copy the current contents of
   `ops/google-apps-script/export-blog-articles.gs` into the project.
3. Set the project time zone to `America/New_York`.
4. Open **Project Settings > Script Properties**.
5. Add:

   ```text
   AI_RESEARCH_EDITOR_ROOT_FOLDER_ID=<permanent AI Research Editor folder ID>
   GITHUB_DISPATCH_TOKEN=<fine-grained GitHub token>
   ```

6. The following properties are optional:

   ```text
   BLOG_SOURCE_DOCUMENT_NAME=Medium
   GITHUB_REPOSITORY=Vizo-AI/blog.ixo8.com
   ```

   Both shown values are already the defaults.

7. Select `exportTodaysArticleNow` and run it once.
8. Review and grant the requested Google Drive and external-request permissions.
9. Open the repository's **Actions** page. Confirm that an
   **Import Google Drive article** run appeared.
10. Confirm that the run created an `automation/articles-*` pull request.
11. Review but do not merge the first PR until the verification checklist below
    is complete.
12. Return to Apps Script and run `installPublishingWindowTrigger` once.

The installed Apps Script trigger wakes every five minutes because Apps Script
does not offer a compact M/W/F 30-minute recurrence. The function returns
immediately without a Drive or GitHub request outside Monday, Wednesday, and
Friday from 08:00 through 08:40 Eastern.

## Publishing contract

The `Medium` Doc must begin with the real article title, preferably formatted as
Heading 1. The generic filename `Medium` is never used as the article title.

Recommended document structure:

```markdown
# Article title

The opening paragraph should be a concise description of the article.

## First section

Article content.

## Sources

- https://primary-source.example/report
- https://another-source.example/document
```

The final `_posts` filename is:

```text
YYYY-MM-DD-lowercase-url-slug.md
```

That becomes:

```text
https://ai-blog.ixo8.com/YYYY/MM/DD/lowercase-url-slug/
```

The importer creates frontmatter like:

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

It derives the title, date, description, sources, and slug, then removes the
duplicate body H1 because the site layout renders the frontmatter title.

## Normal Monday/Wednesday/Friday operation

1. At 08:00 Eastern, the research workflow begins creating the dated documents.
2. Apps Script checks only
   `AI Research Editor/YYYY-MM/YYYY-MM-DD/Medium` during the morning window.
3. If the date folder or `Medium` is not ready, it records a waiting message and
   checks again later.
4. Once found, Apps Script exports the native Doc as Markdown and dispatches it
   to GitHub. All Drive files remain unchanged.
5. GitHub Actions validates the payload, runs importer tests and the complete
   site build, creates an article branch, and opens a pull request.
6. Review the pull request and its checks.
7. Update optional `topics`, `tags`, `featured`, or `generated_with_ai` metadata
   in the PR if needed.
8. Merge only after editorial review.
9. Confirm the **Deploy to GitHub Pages** workflow succeeds.
10. Open the production article URL and research record.

## Required pull-request review checklist

- [ ] Headline and description are accurate.
- [ ] Publication date matches the dated Drive folder.
- [ ] URL slug is lowercase and readable.
- [ ] No duplicate H1 appears in the article body.
- [ ] Section headings use Heading 2 or deeper.
- [ ] Primary sources are present and open successfully.
- [ ] `generated_with_ai` is accurate.
- [ ] `featured` is intentional.
- [ ] GitHub checks pass.
- [ ] No unrelated files are included.

## Manual and recovery operations

### Process today's article immediately

Run `exportTodaysArticleNow` in Apps Script. The publishing-day/time window is
ignored, but source selection and duplicate protection remain enabled.

### Process a past date

1. Add this temporary Apps Script property:

   ```text
   BLOG_RECOVERY_DATE=YYYY-MM-DD
   ```

2. Run `exportRecoveryArticle`.
3. Confirm the GitHub intake run appeared.
4. Delete `BLOG_RECOVERY_DATE` to prevent accidental reuse.

### Retry a failed GitHub intake

If Apps Script successfully dispatched the article but the GitHub job failed,
open the failed **Import Google Drive article** run and choose **Re-run jobs**.
The original validated event payload is reused. Do not change or clear Apps
Script's duplicate state merely to retry a GitHub job.

### Import a local Markdown file manually

The local importer remains available for exceptional manual use:

```bash
npm run articles:import -- \
  --inbox "/absolute/path/to/a-temporary-markdown-folder" \
  --min-age-seconds 0 \
  --dry-run
```

Remove `--dry-run` only after reviewing the planned destination.

## Monitoring

Check these surfaces in order:

1. Apps Script **Executions** for folder lookup, export, and dispatch status.
2. GitHub Actions **Import Google Drive article** for intake and validation.
3. The generated pull request for the formatted article and checks.
4. GitHub Actions **Deploy to GitHub Pages** after merge.
5. The live article and research record.

Normal Apps Script messages include:

```text
Waiting: Medium is not available in YYYY-MM/YYYY-MM-DD.
Already exported: YYYY-MM/YYYY-MM-DD/Medium.
Dispatched YYYY-MM/YYYY-MM-DD/Medium as YYYY-MM-DD-article-slug.md.
```

## Failure and recovery

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| No dated folder found | Research generation is late or the Apps Script time zone is wrong | Inspect the research schedule and project time zone; run today's export manually when ready |
| `Medium` not found but siblings exist | It is late, renamed, or not a native Google Doc | Wait, restore the exact name, or deliberately change `BLOG_SOURCE_DOCUMENT_NAME` |
| More than one matching folder or Doc | Duplicate names make selection ambiguous | Rename the duplicate; the exporter intentionally refuses to guess |
| Title error | The first content line is empty, generic, or not the real title | Put the real article title first, preferably as Heading 1 |
| GitHub dispatch returns 401 or 403 | Token missing, expired, or incorrectly scoped | Rotate the fine-grained token in both protected locations; never expose its value |
| GitHub dispatch returns 404 | Repository name is wrong or token lacks access | Verify `GITHUB_REPOSITORY` and the token's selected repository |
| Dispatch handoff is too large | Markdown exceeds the repository-dispatch payload limit | Shorten the article or implement a private object-storage handoff |
| Intake says secret is missing or checkout fails | GitHub Actions secret is absent or expired | Replace `BLOG_PUBLISHER_GITHUB_TOKEN` in repository Actions secrets |
| Importer rejects the article | Content/date is invalid or the target post already exists | Read the failed Actions step and correct the source or PR deliberately |
| Branch is pushed but no PR appears | Token lacks Pull requests write permission | Correct the token scope and rerun the failed GitHub job |
| PR exists but article is not live | PR is unmerged or deployment failed | Merge only after review, then inspect the Pages deployment |

## Local verification after repository changes

```bash
npm run test:articles
npm run check
npm run build
node --check < ops/google-apps-script/export-blog-articles.gs
```

After changing Apps Script, copy the reviewed version into the Apps Script
project and run `exportTodaysArticleNow` manually. After changing the GitHub
intake workflow, use a reviewed test Doc and confirm the entire PR flow before
relying on the schedule.

## Security and operational rules

- Never commit or print Drive folder IDs, OAuth data, browser cookies, GitHub
  tokens, private keys, passwords, or `.env` values.
- Never place secrets in an article or dispatch payload.
- Keep the Apps Script project private and minimize its editors.
- Keep pull-request review between ingestion and publication.
- Rotate the fine-grained token before it expires and after any suspected
  exposure.
- Do not force-push `main` or automation branches.
- The exact `Medium` Doc is an instruction to prepare a review PR, not to bypass
  editorial approval.

## Official references

- [Google Drive API: export a native Workspace document](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export)
- [Google Drive export formats, including Markdown](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)
- [Apps Script URL Fetch service](https://developers.google.com/apps-script/guides/services/external)
- [GitHub repository dispatch events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch)
- [GitHub REST API: create a repository dispatch event](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)
- [GitHub Actions secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
