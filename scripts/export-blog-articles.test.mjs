import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../ops/google-apps-script/export-blog-articles.gs', import.meta.url), 'utf8');
const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short'
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23'
});
const utilities = {
  formatDate(date, timeZone, pattern) {
    assert.equal(timeZone, 'America/New_York');
    if (pattern === 'EEE') return weekdayFormatter.format(date);
    const parts = Object.fromEntries(
      timeFormatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
    );
    if (pattern === 'H') return String(Number(parts.hour));
    if (pattern === 'm') return String(Number(parts.minute));
    throw new Error(`Unsupported test pattern: ${pattern}`);
  }
};

const context = vm.createContext({ console, Utilities: utilities });
vm.runInContext(`${source}\nglobalThis.exporterTestApi = {
  articleSlug,
  articleTitleFromMarkdown,
  exportArticleForCalendarDate,
  isPublishingWindow
};`, context);
const api = context.exporterTestApi;

test('exporter selects a title from the first content line', () => {
  assert.equal(api.articleTitleFromMarkdown('<!-- marker -->\n\n# Real Article Title\n\nBody'), 'Real Article Title');
  assert.equal(api.articleTitleFromMarkdown('**Plain title**\n\nBody'), 'Plain title');
});

test('exporter creates a stable article slug', () => {
  assert.equal(api.articleSlug('GPT-6 Astra: What Changes?'), 'gpt-6-astra-what-changes');
});

test('publishing window is Monday, Wednesday, and Friday mornings in New York', () => {
  assert.equal(api.isPublishingWindow(new Date('2026-09-04T12:10:00Z')), true);
  assert.equal(api.isPublishingWindow(new Date('2026-09-04T12:41:00Z')), false);
  assert.equal(api.isPublishingWindow(new Date('2026-09-05T12:10:00Z')), false);
});

test('recovery date rejects impossible calendar dates before accessing Drive', () => {
  assert.throws(() => api.exportArticleForCalendarDate('2026-02-31'), /Invalid calendar date/);
  assert.throws(() => api.exportArticleForCalendarDate('September 4'), /Expected a YYYY-MM-DD/);
});
