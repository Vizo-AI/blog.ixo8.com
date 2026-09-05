/**
 * Exports the scheduled Medium Google Doc as Markdown.
 *
 * Source hierarchy:
 *   AI Research Editor/YYYY-MM/YYYY-MM-DD/Medium
 *
 * Required Apps Script properties:
 *   AI_RESEARCH_EDITOR_ROOT_FOLDER_ID
 *   GITHUB_DISPATCH_TOKEN
 *
 * Optional Apps Script property:
 *   BLOG_SOURCE_DOCUMENT_NAME (default: Medium)
 *   BLOG_RECOVERY_DATE (YYYY-MM-DD; used only by exportRecoveryArticle)
 *   GITHUB_REPOSITORY (default: Vizo-AI/blog.ixo8.com)
 *
 * Folder IDs and credentials must not be committed to this repository.
 */

const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';
const PUBLISH_TIME_ZONE = 'America/New_York';
const PUBLISH_WEEKDAYS = new Set(['Mon', 'Wed', 'Fri']);
const PUBLISH_START_MINUTE = 8 * 60;
const PUBLISH_END_MINUTE = 8 * 60 + 40;

function requiredProperty_(name) {
  if (!name) {
    throw new Error('Private helper called without a property name. Run exportTodaysArticleNow or installPublishingWindowTrigger.');
  }
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Missing required Script Property: ${name}`);
  return value;
}

function optionalProperty_(name, fallback) {
  return PropertiesService.getScriptProperties().getProperty(name) || fallback;
}

function articleSlug_(value) {
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

function isPublishingWindow_(date) {
  const weekday = Utilities.formatDate(date, PUBLISH_TIME_ZONE, 'EEE');
  const hour = Number(Utilities.formatDate(date, PUBLISH_TIME_ZONE, 'H'));
  const minute = Number(Utilities.formatDate(date, PUBLISH_TIME_ZONE, 'm'));
  const minuteOfDay = hour * 60 + minute;
  return PUBLISH_WEEKDAYS.has(weekday)
    && minuteOfDay >= PUBLISH_START_MINUTE
    && minuteOfDay <= PUBLISH_END_MINUTE;
}

function foldersNamed_(parent, name) {
  const matches = [];
  const folders = parent.getFoldersByName(name);
  while (folders.hasNext()) matches.push(folders.next());
  return matches;
}

function exactlyOneFolder_(parent, name) {
  const matches = foldersNamed_(parent, name);
  if (matches.length === 0) return undefined;
  if (matches.length > 1) throw new Error(`More than one folder named ${name} exists under ${parent.getName()}.`);
  return matches[0];
}

function exactlyOneGoogleDoc_(parent, name) {
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

function exportGoogleDocAsMarkdown_(file) {
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

function dispatchArticleToGitHub_(outputName, markdown, source) {
  const repository = optionalProperty_('GITHUB_REPOSITORY', 'Vizo-AI/blog.ixo8.com');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
  }

  const requestBody = JSON.stringify({
    event_type: 'drive_article_ready',
    client_payload: {
      filename: outputName,
      markdown_base64: Utilities.base64Encode(markdown, Utilities.Charset.UTF_8),
      source_id: source.getId(),
      source_updated_at: source.getLastUpdated().toISOString()
    }
  });

  // GitHub accepts repository-dispatch bodies below 64 KB. Leave headroom for
  // JSON encoding and future metadata fields.
  if (requestBody.length > 60000) {
    throw new Error(`${outputName} is too large for the GitHub dispatch handoff.`);
  }

  const response = UrlFetchApp.fetch(`https://api.github.com/repos/${repository}/dispatches`, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${requiredProperty_('GITHUB_DISPATCH_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    payload: requestBody,
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 204) {
    throw new Error(`GitHub dispatch failed with HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
  }
}

function cleanMarkdownTitle_(value) {
  return value
    .replace(/^#+\s*/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^__(.*?)__$/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function articleTitleFromMarkdown_(markdown) {
  const firstContentLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('<!--'));
  return firstContentLine ? cleanMarkdownTitle_(firstContentLine) : undefined;
}

function exportArticleForCalendarDate_(calendarDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
    throw new Error(`Expected a YYYY-MM-DD calendar date, received: ${calendarDate}`);
  }
  const parsedDate = new Date(`${calendarDate}T12:00:00Z`);
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== calendarDate) {
    throw new Error(`Invalid calendar date: ${calendarDate}`);
  }

  const root = DriveApp.getFolderById(requiredProperty_('AI_RESEARCH_EDITOR_ROOT_FOLDER_ID'));
  const sourceName = optionalProperty_('BLOG_SOURCE_DOCUMENT_NAME', 'Medium');
  const yearMonth = calendarDate.slice(0, 7);
  const monthFolder = exactlyOneFolder_(root, yearMonth);
  if (!monthFolder) {
    console.log(`Waiting: ${root.getName()}/${yearMonth} does not exist yet.`);
    return;
  }

  const dateFolder = exactlyOneFolder_(monthFolder, calendarDate);
  if (!dateFolder) {
    console.log(`Waiting: ${root.getName()}/${yearMonth}/${calendarDate} does not exist yet.`);
    return;
  }

  const source = exactlyOneGoogleDoc_(dateFolder, sourceName);
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

  let markdown = exportGoogleDocAsMarkdown_(source).replace(/^\uFEFF/, '').trim();
  const articleTitle = articleTitleFromMarkdown_(markdown);
  if (!articleTitle || articleTitle.toLowerCase() === sourceName.toLowerCase()) {
    throw new Error(`${sourceName} must begin with the article title, preferably formatted as Heading 1.`);
  }

  if (!/^#\s+/.test(markdown)) markdown = `# ${articleTitle}\n\n${markdown}`;
  const slug = articleSlug_(articleTitle);
  if (!slug) throw new Error(`Could not create a slug from article title: ${articleTitle}.`);

  const outputName = `${calendarDate}-${slug}.md`;
  markdown = `<!-- vizo-drive-file-id: ${source.getId()} -->\n\n${markdown}\n`;
  dispatchArticleToGitHub_(outputName, markdown, source);
  scriptProperties.setProperty(identity, new Date().toISOString());
  console.log(`Dispatched ${yearMonth}/${calendarDate}/${sourceName} as ${outputName}.`);
}

function exportArticleForDate_(date) {
  const calendarDate = Utilities.formatDate(date, PUBLISH_TIME_ZONE, 'yyyy-MM-dd');
  exportArticleForCalendarDate_(calendarDate);
}

/** Scheduled entrypoint. It performs no Drive lookup outside the publishing window. */
function exportScheduledArticle() {
  const now = new Date();
  if (!isPublishingWindow_(now)) return;
  exportArticleForDate_(now);
}

/** Manual recovery/test entrypoint. It ignores the publishing window. */
function exportTodaysArticleNow() {
  exportArticleForDate_(new Date());
}

/** Manual recovery entrypoint for BLOG_RECOVERY_DATE. It ignores the publishing window. */
function exportRecoveryArticle() {
  exportArticleForCalendarDate_(requiredProperty_('BLOG_RECOVERY_DATE'));
}

/** Safe setup diagnostic. It never logs property values or tokens. */
function diagnoseConfiguration() {
  const properties = PropertiesService.getScriptProperties();
  const rootId = properties.getProperty('AI_RESEARCH_EDITOR_ROOT_FOLDER_ID');
  const dispatchToken = properties.getProperty('GITHUB_DISPATCH_TOKEN');
  console.log(`AI_RESEARCH_EDITOR_ROOT_FOLDER_ID configured: ${rootId ? 'yes' : 'no'}`);
  console.log(`GITHUB_DISPATCH_TOKEN configured: ${dispatchToken ? 'yes' : 'no'}`);

  const missing = [];
  if (!rootId) missing.push('AI_RESEARCH_EDITOR_ROOT_FOLDER_ID');
  if (!dispatchToken) missing.push('GITHUB_DISPATCH_TOKEN');
  if (missing.length > 0) {
    throw new Error(`Missing required Script Properties: ${missing.join(', ')}`);
  }

  let root;
  try {
    root = DriveApp.getFolderById(rootId);
  } catch {
    throw new Error('AI_RESEARCH_EDITOR_ROOT_FOLDER_ID must be only the identifier after /folders/ in the AI Research Editor URL, not the complete URL.');
  }

  console.log(`Drive root accessible: yes (folder name: ${root.getName()})`);
  const calendarDate = Utilities.formatDate(new Date(), PUBLISH_TIME_ZONE, 'yyyy-MM-dd');
  const yearMonth = calendarDate.slice(0, 7);
  const monthFolder = exactlyOneFolder_(root, yearMonth);
  const dateFolder = monthFolder ? exactlyOneFolder_(monthFolder, calendarDate) : undefined;
  const source = dateFolder ? exactlyOneGoogleDoc_(dateFolder, optionalProperty_('BLOG_SOURCE_DOCUMENT_NAME', 'Medium')) : undefined;
  console.log(`Today's month folder found: ${monthFolder ? 'yes' : 'no'}`);
  console.log(`Today's date folder found: ${dateFolder ? 'yes' : 'no'}`);
  console.log(`Today's Medium Google Doc found: ${source ? 'yes' : 'no'}`);
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
