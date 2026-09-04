#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);

export function decodeDispatchArticle(serializedPayload) {
  let payload;
  try {
    payload = JSON.parse(serializedPayload);
  } catch {
    throw new Error('The repository-dispatch payload is not valid JSON.');
  }

  const filename = payload?.filename;
  if (typeof filename !== 'string' || path.basename(filename) !== filename) {
    throw new Error('The dispatch filename must be a plain filename.');
  }
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(filename)) {
    throw new Error('The dispatch filename must match YYYY-MM-DD-lowercase-slug.md.');
  }

  const encoded = payload?.markdown_base64;
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > 60000) {
    throw new Error('The dispatch Markdown must be non-empty base64 below 60,000 characters.');
  }
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('The dispatch Markdown is not valid base64.');
  }

  const markdown = Buffer.from(encoded, 'base64').toString('utf8');
  if (!markdown.trim() || markdown.includes('\uFFFD')) {
    throw new Error('The dispatch Markdown is empty or is not valid UTF-8.');
  }

  return { filename, markdown };
}

async function main() {
  const inbox = process.env.BLOG_ARTICLE_INBOX;
  const serializedPayload = process.env.BLOG_DISPATCH_PAYLOAD;
  if (!inbox) throw new Error('BLOG_ARTICLE_INBOX is required.');
  if (!serializedPayload) throw new Error('BLOG_DISPATCH_PAYLOAD is required.');

  const article = decodeDispatchArticle(serializedPayload);
  await mkdir(inbox, { recursive: true });
  const destination = path.join(inbox, article.filename);
  await writeFile(destination, article.markdown, { encoding: 'utf8', flag: 'wx' });
  console.log(`Prepared dispatched article: ${article.filename}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
