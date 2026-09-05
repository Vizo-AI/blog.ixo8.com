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
const fetchRequests = [];
const utilities = {
  Charset: { UTF_8: 'UTF-8' },
  base64Encode(value, charset) {
    assert.equal(charset, 'UTF-8');
    return Buffer.from(value, 'utf8').toString('base64');
  },
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
const propertiesService = {
  getScriptProperties() {
    return {
      getProperty(name) {
        return {
          GITHUB_DISPATCH_TOKEN: 'test-token',
          GITHUB_REPOSITORY: 'Vizo-AI/blog.ixo8.com'
        }[name];
      }
    };
  }
};
const urlFetchApp = {
  fetch(url, options) {
    fetchRequests.push({ url, options });
    return {
      getResponseCode: () => 204,
      getContentText: () => ''
    };
  }
};

const context = vm.createContext({
  console,
  PropertiesService: propertiesService,
  UrlFetchApp: urlFetchApp,
  Utilities: utilities
});
vm.runInContext(`${source}\nglobalThis.exporterTestApi = {
  articleSlug: articleSlug_,
  articleTitleFromMarkdown: articleTitleFromMarkdown_,
  dispatchArticleToGitHub: dispatchArticleToGitHub_,
  exportArticleForCalendarDate: exportArticleForCalendarDate_,
  isPublishingWindow: isPublishingWindow_,
  sourcePathNames: sourcePathNames_
};`, context);
const api = context.exporterTestApi;

test('exporter selects a title from the first content line', () => {
  assert.equal(api.articleTitleFromMarkdown('<!-- marker -->\n\n# Real Article Title\n\nBody'), 'Real Article Title');
  assert.equal(api.articleTitleFromMarkdown('**Plain title**\n\nBody'), 'Plain title');
});

test('exporter creates a stable article slug', () => {
  assert.equal(api.articleSlug('GPT-6 Astra: What Changes?'), 'gpt-6-astra-what-changes');
});

test('exporter traverses year, year-month, and calendar-date folders', () => {
  assert.deepEqual(
    Array.from(api.sourcePathNames('2026-09-04')),
    ['2026', '2026-09', '2026-09-04']
  );
});

test('exporter dispatches Markdown without creating a Drive handoff file', () => {
  api.dispatchArticleToGitHub(
    '2026-09-04-useful-article.md',
    '# Useful Article\n\nBody.',
    {
      getId: () => 'drive-file-id',
      getLastUpdated: () => new Date('2026-09-04T12:05:00Z')
    }
  );

  assert.equal(fetchRequests.length, 1);
  assert.equal(fetchRequests[0].url, 'https://api.github.com/repos/Vizo-AI/blog.ixo8.com/dispatches');
  assert.equal(fetchRequests[0].options.method, 'post');
  const body = JSON.parse(fetchRequests[0].options.payload);
  assert.equal(body.event_type, 'drive_article_ready');
  assert.equal(body.client_payload.filename, '2026-09-04-useful-article.md');
  assert.equal(
    Buffer.from(body.client_payload.markdown_base64, 'base64').toString('utf8'),
    '# Useful Article\n\nBody.'
  );
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
