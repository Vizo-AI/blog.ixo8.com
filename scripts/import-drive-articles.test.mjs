import assert from 'node:assert/strict';
import test from 'node:test';

import { formatArticle, parseArgs, slugify } from './import-drive-articles.mjs';

test('slugify creates a lowercase URL-safe slug', () => {
  assert.equal(slugify('GPT-6 Astra: Can It & Should We?'), 'gpt-6-astra-can-it-and-should-we');
});

test('formats raw Drive Markdown and removes its duplicate H1', () => {
  const raw = `# A Useful Article

This is a useful description of the article.

## Evidence

Read https://example.com/research for details.
`;
  const article = formatArticle(raw, '2026-09-04-A-Useful-Article.md');

  assert.equal(article.filename, '2026-09-04-a-useful-article.md');
  assert.match(article.content, /^---\ntitle: "A Useful Article"/);
  assert.match(article.content, /description: "This is a useful description of the article\."/);
  assert.match(article.content, /sources:\n  - "https:\/\/example\.com\/research"/);
  assert.doesNotMatch(article.content, /\n# A Useful Article\n/);
  assert.match(article.content, /\n## Evidence\n/);
});

test('preserves supported frontmatter and explicit false values', () => {
  const raw = `---
title: "Human-written post"
date: 2026-09-03
description: "Editorial description"
authors:
  - "Editor"
topics:
  - "Research"
generated_with_ai: false
featured: true
---

Body text.
`;
  const article = formatArticle(raw, 'draft.md');

  assert.equal(article.filename, '2026-09-03-human-written-post.md');
  assert.match(article.content, /authors:\n  - "Editor"/);
  assert.match(article.content, /topics:\n  - "Research"/);
  assert.match(article.content, /generated_with_ai: false/);
  assert.match(article.content, /featured: true/);
});

test('rejects an invalid publication date', () => {
  assert.throws(
    () => formatArticle('# Invalid Date\n\nBody.', '2026-02-31-invalid-date.md'),
    /invalid publication date/
  );
});

test('requires an inbox and only accepts supported publish modes', () => {
  assert.throws(() => parseArgs([], {}), /--inbox is required/);
  assert.throws(() => parseArgs(['--inbox', '/tmp/inbox', '--publish', 'main'], {}), /none or pr/);
  assert.equal(parseArgs(['--inbox', '/tmp/inbox', '--publish', 'pr'], {}).publish, 'pr');
});
