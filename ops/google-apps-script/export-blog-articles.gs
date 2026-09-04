/**
 * Exports the scheduled Medium Google Doc as Markdown.
 *
 * Source hierarchy:
 *   AI Research Editor/YYYY-MM/YYYY-MM-DD/Medium
 *
 * Required Apps Script properties:
 *   AI_RESEARCH_EDITOR_ROOT_FOLDER_ID
 *   BLOG_READY_FOLDER_ID
 *
 * Optional Apps Script property:
 *   BLOG_SOURCE_DOCUMENT_NAME (default: Medium)
 *   BLOG_RECOVERY_DATE (YYYY-MM-DD; used only by exportRecoveryArticle)
 *
 * Folder IDs and credentials must not be committed to this repository.
 */

const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';
const PUBLISH_TIME_ZONE = 'America/New_York';
const PUBLISH_WEEKDAYS = new Set(['Mon', 'Wed', 'Fri']);
const PUBLISH_START_MINUTE = 8 * 60;
const PUBLISH_END_MINUTE = 8 * 60 + 40;

function requiredProperty(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Missing required Script Property: ${name}`);
  return value;
}

function optionalProperty(name, fallback) {
  return PropertiesService.getScriptProperties().getProperty(name) || fallback;
}

function articleSlug(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
}

function isPublishingWindow(date) {
  const weekday = Utilities.formatDate(date, PUBLISH_TIME_ZONE, 'EEE');
  const hour = Number(Utilities.formatDate(date, PUBLISH_TIME_ZONE, 'H'));
  const minute = Number(Utilities.formatDate(date, PUBLISH_TIME_ZONE, 'm'));
  const minuteOfDay = hour * 60 + minute;
  return PUBLISH_WEEKDAYS.has(weekday)
    && minuteOfDay >= PUBLISH_START_MINUTE
    && minuteOfDay <= PUBLISH_END_MINUTE;
}

function foldersNamed(parent, name) {
  const matches = [];
  const folders = parent.getFoldersByName(name);
  while (folders.hasNext()) matches.push(folders.next());
  return matches;
}

function exactlyOneFolder(parent, name) {
  const matches = foldersNamed(parent, name);
  if (matches.length === 0) return undefined;
  if (matches.length > 1) throw new Error(`More than one folder named ${name} exists under ${parent.getName()}.`);
  return matches[0];
}

function exactlyOneGoogleDoc(parent, name) {
  const matches = [];
  const files = parent.getFilesByName(name);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === GOOGLE_DOC_MIME_TYPE) matches.push(file);
  }
  if (matches.length === 0) return undefined;
  if (matches.length > 1) throw new Error(`More than one Google Doc named ${name} exists in ${parent.getName()}.`);
  return matches[0];
}

function exportGoogleDocAsMarkdown(file) {
  const endpoint = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.getId())}/export?mimeType=${encodeURIComponent('text/markdown')}`;
  const response = UrlFetchApp.fetch(endpoint, {
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Drive export failed for ${file.getName()} with HTTP ${response.getResponseCode()}.`);
  }
  return response.getContentText('UTF-8');
}

function cleanMarkdownTitle(value) {
  return value
    .replace(/^#+\s*/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^__(.*?)__$/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function articleTitleFromMarkdown(markdown) {
  const firstContentLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('<!--'));
  return firstContentLine ? cleanMarkdownTitle(firstContentLine) : undefined;
}

function exportArticleForCalendarDate(calendarDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
    throw new Error(`Expected a YYYY-MM-DD calendar date, received: ${calendarDate}`);
  }
  const parsedDate = new Date(`${calendarDate}T12:00:00Z`);
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== calendarDate) {
    throw new Error(`Invalid calendar date: ${calendarDate}`);
  }

  const root = DriveApp.getFolderById(requiredProperty('AI_RESEARCH_EDITOR_ROOT_FOLDER_ID'));
  const ready = DriveApp.getFolderById(requiredProperty('BLOG_READY_FOLDER_ID'));
  const sourceName = optionalProperty('BLOG_SOURCE_DOCUMENT_NAME', 'Medium');
  const yearMonth = calendarDate.slice(0, 7);
  const monthFolder = exactlyOneFolder(root, yearMonth);
  if (!monthFolder) {
    console.log(`Waiting: ${root.getName()}/${yearMonth} does not exist yet.`);
    return;
  }

  const dateFolder = exactlyOneFolder(monthFolder, calendarDate);
  if (!dateFolder) {
    console.log(`Waiting: ${root.getName()}/${yearMonth}/${calendarDate} does not exist yet.`);
    return;
  }

  const source = exactlyOneGoogleDoc(dateFolder, sourceName);
  if (!source) {
    console.log(`Waiting: ${sourceName} is not available in ${yearMonth}/${calendarDate}.`);
    return;
  }

  const identity = `exported:${source.getId()}:${source.getLastUpdated().getTime()}`;
  const scriptProperties = PropertiesService.getScriptProperties();
  if (scriptProperties.getProperty(identity)) {
    console.log(`Already exported: ${yearMonth}/${calendarDate}/${sourceName}.`);
    return;
  }

  let markdown = exportGoogleDocAsMarkdown(source).replace(/^\uFEFF/, '').trim();
  const articleTitle = articleTitleFromMarkdown(markdown);
  if (!articleTitle || articleTitle.toLowerCase() === sourceName.toLowerCase()) {
    throw new Error(`${sourceName} must begin with the article title, preferably formatted as Heading 1.`);
  }

  if (!/^#\s+/.test(markdown)) markdown = `# ${articleTitle}\n\n${markdown}`;
  const slug = articleSlug(articleTitle);
  if (!slug) throw new Error(`Could not create a slug from article title: ${articleTitle}.`);

  const outputName = `${calendarDate}-${slug}.md`;
  if (ready.getFilesByName(outputName).hasNext()) {
    throw new Error(`${outputName} already exists in the Blog Ready Markdown folder.`);
  }

  markdown = `<!-- vizo-drive-file-id: ${source.getId()} -->\n\n${markdown}\n`;
  ready.createFile(outputName, markdown, 'text/markdown');
  scriptProperties.setProperty(identity, new Date().toISOString());
  console.log(`Exported ${yearMonth}/${calendarDate}/${sourceName} as ${outputName}.`);
}

function exportArticleForDate(date) {
  const calendarDate = Utilities.formatDate(date, PUBLISH_TIME_ZONE, 'yyyy-MM-dd');
  exportArticleForCalendarDate(calendarDate);
}

/** Scheduled entrypoint. It performs no Drive lookup outside the publishing window. */
function exportScheduledArticle() {
  const now = new Date();
  if (!isPublishingWindow(now)) return;
  exportArticleForDate(now);
}

/** Manual recovery/test entrypoint. It ignores the publishing window. */
function exportTodaysArticleNow() {
  exportArticleForDate(new Date());
}

/** Manual recovery entrypoint for BLOG_RECOVERY_DATE. It ignores the publishing window. */
function exportRecoveryArticle() {
  exportArticleForCalendarDate(requiredProperty('BLOG_RECOVERY_DATE'));
}

/** Install one lightweight five-minute trigger; date/time filtering happens in code. */
function installPublishingWindowTrigger() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (['exportReadyArticles', 'exportScheduledArticle'].includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  ScriptApp.newTrigger('exportScheduledArticle').timeBased().everyMinutes(5).create();
}
