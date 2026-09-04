import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeDispatchArticle } from './prepare-dispatch-article.mjs';

function payload(filename, markdown) {
  return JSON.stringify({
    filename,
    markdown_base64: Buffer.from(markdown, 'utf8').toString('base64')
  });
}

test('decodes a valid dispatched Markdown article', () => {
  const article = decodeDispatchArticle(payload('2026-09-04-useful-article.md', '# Useful Article\n\nBody.'));
  assert.equal(article.filename, '2026-09-04-useful-article.md');
  assert.equal(article.markdown, '# Useful Article\n\nBody.');
});

test('rejects traversal and malformed article filenames', () => {
  assert.throws(() => decodeDispatchArticle(payload('../article.md', '# Article')), /plain filename/);
  assert.throws(() => decodeDispatchArticle(payload('Medium.gdoc', '# Article')), /must match/);
});

test('rejects malformed base64 content', () => {
  assert.throws(
    () => decodeDispatchArticle(JSON.stringify({
      filename: '2026-09-04-article.md',
      markdown_base64: 'not base64!'
    })),
    /valid base64/
  );
});
