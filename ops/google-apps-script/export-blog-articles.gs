/**
 * Exports Google Docs from a Blog Inbox folder as Markdown.
 *
 * Required Apps Script properties:
 *   BLOG_INBOX_FOLDER_ID
 *   BLOG_READY_FOLDER_ID
 *   BLOG_PROCESSED_DOCS_FOLDER_ID
 *
 * Folder IDs and credentials must not be committed to this repository.
 */

const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

function requiredProperty(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Missing required Script Property: ${name}`);
  return value;
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

function exportReadyArticles() {
  const inbox = DriveApp.getFolderById(requiredProperty('BLOG_INBOX_FOLDER_ID'));
  const ready = DriveApp.getFolderById(requiredProperty('BLOG_READY_FOLDER_ID'));
  const processedDocs = DriveApp.getFolderById(requiredProperty('BLOG_PROCESSED_DOCS_FOLDER_ID'));
  const files = inbox.getFiles();
  const scriptProperties = PropertiesService.getScriptProperties();

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== GOOGLE_DOC_MIME_TYPE) {
      console.warn(`Skipping non-Google-Doc file: ${file.getName()}`);
      continue;
    }

    const identity = `exported:${file.getId()}:${file.getLastUpdated().getTime()}`;
    if (scriptProperties.getProperty(identity)) continue;

    try {
      const title = file.getName().trim();
      const slug = articleSlug(title);
      if (!slug) throw new Error(`Could not create a slug for ${title}.`);

      const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const outputName = `${date}-${slug}.md`;
      if (ready.getFilesByName(outputName).hasNext()) {
        throw new Error(`${outputName} already exists in the Ready Markdown folder.`);
      }

      let markdown = exportGoogleDocAsMarkdown(file).replace(/^\uFEFF/, '').trim();
      if (!/^#\s+/.test(markdown)) markdown = `# ${title}\n\n${markdown}`;
      markdown = `<!-- vizo-drive-file-id: ${file.getId()} -->\n\n${markdown}\n`;

      ready.createFile(outputName, markdown, 'text/markdown');
      scriptProperties.setProperty(identity, new Date().toISOString());
      file.moveTo(processedDocs);
      console.log(`Exported ${file.getName()} as ${outputName}.`);
    } catch (error) {
      console.error(`Failed to export ${file.getName()}: ${error.message}`);
    }
  }
}

function installFiveMinuteTrigger() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'exportReadyArticles') ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger('exportReadyArticles').timeBased().everyMinutes(5).create();
}
