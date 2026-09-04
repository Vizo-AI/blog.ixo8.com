#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const postsDirectory = path.join(repositoryRoot, '_posts');
const stateDirectory = path.join(repositoryRoot, '.blog-publisher');
const statePath = path.join(stateDirectory, 'state.json');

const HELP = `Usage:
  npm run articles:import -- --inbox /absolute/path/to/Ready-Markdown [options]

Options:
  --processed PATH       Move successful source files here.
  --failed PATH          Move rejected source files here and add an error note.
  --author NAME          Default author (default: Vizo AI).
  --min-age-seconds N    Ignore files changed too recently (default: 30).
  --publish MODE         none or pr (default: none).
  --base BRANCH          Pull-request base branch (default: main).
  --remote NAME          Git remote (default: origin).
  --dry-run              Show planned imports without writing anything.
  --skip-validation      Skip npm run check and npm run build.
  --help                  Show this help.

Environment equivalents:
  BLOG_ARTICLE_INBOX, BLOG_ARTICLE_PROCESSED, BLOG_ARTICLE_FAILED,
  BLOG_ARTICLE_AUTHOR, BLOG_ARTICLE_PUBLISH
`;

function optionValue(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseArgs(args, env = process.env) {
  const options = {
    inbox: env.BLOG_ARTICLE_INBOX,
    processed: env.BLOG_ARTICLE_PROCESSED,
    failed: env.BLOG_ARTICLE_FAILED,
    author: env.BLOG_ARTICLE_AUTHOR || 'Vizo AI',
    publish: env.BLOG_ARTICLE_PUBLISH || 'none',
    base: 'main',
    remote: 'origin',
    minAgeSeconds: 30,
    dryRun: false,
    validate: true,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--help') options.help = true;
    else if (option === '--dry-run') options.dryRun = true;
    else if (option === '--skip-validation') options.validate = false;
    else if (option === '--inbox') options.inbox = optionValue(args, index++, option);
    else if (option === '--processed') options.processed = optionValue(args, index++, option);
    else if (option === '--failed') options.failed = optionValue(args, index++, option);
    else if (option === '--author') options.author = optionValue(args, index++, option);
    else if (option === '--publish') options.publish = optionValue(args, index++, option);
    else if (option === '--base') options.base = optionValue(args, index++, option);
    else if (option === '--remote') options.remote = optionValue(args, index++, option);
    else if (option === '--min-age-seconds') {
      options.minAgeSeconds = Number(optionValue(args, index++, option));
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }

  if (!options.help && !options.inbox) throw new Error('--inbox is required.');
  if (!['none', 'pr'].includes(options.publish)) throw new Error('--publish must be none or pr.');
  if (!Number.isFinite(options.minAgeSeconds) || options.minAgeSeconds < 0) {
    throw new Error('--min-age-seconds must be zero or a positive number.');
  }

  for (const key of ['inbox', 'processed', 'failed']) {
    if (options[key]) options[key] = path.resolve(options[key]);
  }

  return options;
}

function splitFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return { yaml: '', body: normalized };
  return { yaml: match[1], body: normalized.slice(match[0].length) };
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function frontmatterScalar(yaml, key) {
  const expression = new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'm');
  const match = yaml.match(expression);
  return match ? unquote(match[1]) : undefined;
}

function frontmatterList(yaml, key) {
  const lines = yaml.split('\n');
  const index = lines.findIndex((line) => new RegExp(`^${key}:\\s*`).test(line));
  if (index === -1) return [];

  const inline = lines[index].replace(new RegExp(`^${key}:\\s*`), '').trim();
  if (inline) {
    if (inline === '[]') return [];
    if (inline.startsWith('[') && inline.endsWith(']')) {
      return inline
        .slice(1, -1)
        .split(',')
        .map((value) => unquote(value))
        .filter(Boolean);
    }
    return [unquote(inline)];
  }

  const values = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const match = lines[cursor].match(/^\s+-\s+(.*?)\s*$/);
    if (!match) break;
    values.push(unquote(match[1]));
  }
  return values;
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Expected true or false, received: ${value}`);
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function yamlList(key, values) {
  if (values.length === 0) return `${key}: []`;
  return `${key}:\n${values.map((value) => `  - ${yamlString(value)}`).join('\n')}`;
}

export function slugify(value) {
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

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York'
  }).format(new Date());
}

function cleanInlineMarkdown(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function descriptionFromBody(body) {
  const paragraphs = body.split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed || /^(#{1,6}\s|[-*+]\s|\d+\.\s|```|\||<!--)/.test(trimmed)) continue;
    const cleaned = cleanInlineMarkdown(trimmed);
    if (!cleaned) continue;
    if (cleaned.length <= 240) return cleaned;
    const shortened = cleaned.slice(0, 237).replace(/\s+\S*$/, '');
    return `${shortened}…`;
  }
  return 'Research analysis from Vizo AI.';
}

function extractSources(body) {
  const matches = body.match(/https?:\/\/[^\s)<>{}\]"']+/g) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, '')))];
}

function titleFromFilename(sourceName) {
  return path.basename(sourceName, path.extname(sourceName))
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

export function formatArticle(markdown, sourceName, defaultAuthor = 'Vizo AI') {
  const { yaml, body: rawBody } = splitFrontmatter(markdown);
  const driveIdMatch = rawBody.match(/<!--\s*vizo-drive-file-id:\s*([^\s]+)\s*-->/i);
  let body = rawBody.replace(/<!--\s*vizo-drive-file-id:\s*[^\s]+\s*-->\s*/gi, '');
  const firstHeading = body.match(/^#\s+(.+?)\s*$/m);
  const title = frontmatterScalar(yaml, 'title') || firstHeading?.[1]?.trim() || titleFromFilename(sourceName);
  if (!title) throw new Error(`${sourceName}: no article title was found.`);

  if (firstHeading && cleanInlineMarkdown(firstHeading[1]) === cleanInlineMarkdown(title)) {
    body = `${body.slice(0, firstHeading.index)}${body.slice(firstHeading.index + firstHeading[0].length)}`;
  }
  body = body.trim();
  if (!body) throw new Error(`${sourceName}: article body is empty.`);

  const filenameDate = path.basename(sourceName).match(/^(\d{4}-\d{2}-\d{2})-/)?.[1];
  const date = frontmatterScalar(yaml, 'date') || filenameDate || today();
  if (!validDate(date)) throw new Error(`${sourceName}: invalid publication date ${date}.`);

  const filenameStem = path.basename(sourceName, path.extname(sourceName));
  const filenameSlug = filenameDate ? filenameStem.slice(11) : '';
  const slug = slugify(frontmatterScalar(yaml, 'slug') || filenameSlug || title);
  if (!slug) throw new Error(`${sourceName}: could not generate a URL slug.`);

  const authors = frontmatterList(yaml, 'authors');
  const topics = frontmatterList(yaml, 'topics');
  const tags = frontmatterList(yaml, 'tags');
  const declaredSources = frontmatterList(yaml, 'sources');
  const sources = [...new Set([...declaredSources, ...extractSources(body)])];
  const description = frontmatterScalar(yaml, 'description') || descriptionFromBody(body);
  const generatedWithAi = parseBoolean(frontmatterScalar(yaml, 'generated_with_ai'), true);
  const featured = parseBoolean(frontmatterScalar(yaml, 'featured'), false);

  const lines = [
    '---',
    `title: ${yamlString(title)}`,
    `date: ${date}`,
    `description: ${yamlString(description)}`,
    yamlList('authors', authors.length > 0 ? authors : [defaultAuthor]),
    yamlList('topics', topics),
    yamlList('tags', tags)
  ];

  for (const key of ['updated', 'hero', 'hero_alt', 'fact_checked_at', 'editorial_status']) {
    const value = frontmatterScalar(yaml, key);
    if (value) lines.push(`${key}: ${key.endsWith('_at') || key === 'updated' ? value : yamlString(value)}`);
  }

  lines.push(
    yamlList('sources', sources),
    `generated_with_ai: ${generatedWithAi}`,
    `featured: ${featured}`,
    '---',
    '',
    body,
    ''
  );

  return {
    filename: `${date}-${slug}.md`,
    content: lines.join('\n'),
    driveFileId: driveIdMatch?.[1],
    title,
    date,
    sources
  };
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: process.env
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} ${args.join(' ')} failed (${code}).${stderr ? `\n${stderr.trim()}` : ''}`));
    });
  });
}

async function loadState() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, articles: {} };
    throw error;
  }
}

async function saveState(state) {
  await mkdir(stateDirectory, { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, statePath);
}

async function moveFile(source, directory) {
  if (!directory) return undefined;
  await mkdir(directory, { recursive: true });
  let destination = path.join(directory, path.basename(source));
  try {
    await stat(destination);
    const extension = path.extname(destination);
    const stem = path.basename(destination, extension);
    destination = path.join(directory, `${stem}-${Date.now()}${extension}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await rename(source, destination);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await copyFile(source, destination);
    await unlink(source);
  }
  return destination;
}

async function rejectSource(sourcePath, failedDirectory, message) {
  if (!failedDirectory) return;
  const destination = await moveFile(sourcePath, failedDirectory);
  await writeFile(`${destination}.error.txt`, `${message}\n`, 'utf8');
}

async function assertPrWorkspace(options) {
  const status = await run('git', ['status', '--porcelain', '--untracked-files=all'], { capture: true });
  if (status) throw new Error('PR publishing requires a clean working tree. Commit or stash local changes first.');
  const branch = await run('git', ['branch', '--show-current'], { capture: true });
  if (branch !== options.base) throw new Error(`PR publishing must start on ${options.base}; current branch is ${branch}.`);
  await run('git', ['pull', '--ff-only', options.remote, options.base]);
}

async function publishPullRequest(options, articles) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const branch = `automation/articles-${timestamp.toLowerCase()}`;
  await run('git', ['switch', '-c', branch]);
  const relativeFiles = articles.map((article) => path.relative(repositoryRoot, article.destination));

  try {
    await run('git', ['add', '--', ...relativeFiles]);
    const label = articles.length === 1 ? articles[0].article.title : `${articles.length} articles`;
    await run('git', ['commit', '-m', `article: publish ${label}`]);
    await run('git', ['push', '--set-upstream', options.remote, branch]);
    const prUrl = await run('gh', [
      'pr', 'create',
      '--base', options.base,
      '--head', branch,
      '--title', `Publish ${label}`,
      '--body', 'Imports validated articles from the Google Drive publishing pipeline.'
    ], { capture: true });
    await run('git', ['switch', options.base]);
    return prUrl;
  } catch (error) {
    throw new Error(`${error.message}\nThe recovery branch is ${branch}; inspect it before retrying.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.inbox === postsDirectory) throw new Error('The inbox cannot be the repository _posts directory.');

  const entries = await readdir(options.inbox, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && /\.md$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (candidates.length === 0) {
    console.log('No Markdown articles are waiting in the inbox.');
    return;
  }

  const state = await loadState();
  const prepared = [];
  let rejected = 0;

  for (const candidate of candidates) {
    const sourcePath = path.join(options.inbox, candidate.name);
    const fileStat = await stat(sourcePath);
    if ((Date.now() - fileStat.mtimeMs) / 1000 < options.minAgeSeconds) {
      console.log(`Waiting for file to settle: ${candidate.name}`);
      continue;
    }

    const markdown = await readFile(sourcePath, 'utf8');
    const sourceHash = createHash('sha256').update(markdown).digest('hex');

    try {
      const article = formatArticle(markdown, candidate.name, options.author);
      const identity = article.driveFileId || sourceHash;
      if (state.articles[identity]?.sourceHash === sourceHash) {
        console.log(`Already imported: ${candidate.name}`);
        continue;
      }

      const destination = path.join(postsDirectory, article.filename);
      try {
        const existing = await readFile(destination, 'utf8');
        if (existing === article.content) {
          console.log(`Already present: ${article.filename}`);
          continue;
        }
        throw new Error(`${article.filename} already exists with different content; refusing to overwrite it.`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      prepared.push({ sourcePath, sourceHash, identity, destination, article });
      console.log(`${options.dryRun ? 'Would import' : 'Prepared'}: ${candidate.name} -> _posts/${article.filename}`);
    } catch (error) {
      rejected += 1;
      console.error(`Rejected ${candidate.name}: ${error.message}`);
      if (!options.dryRun) await rejectSource(sourcePath, options.failed, error.message);
    }
  }

  if (options.dryRun || prepared.length === 0) {
    if (rejected > 0) process.exitCode = 1;
    return;
  }

  if (options.publish === 'pr') await assertPrWorkspace(options);

  const created = [];
  let publicationStarted = false;
  try {
    for (const item of prepared) {
      await writeFile(item.destination, item.article.content, { encoding: 'utf8', flag: 'wx' });
      created.push(item.destination);
    }

    if (options.validate) {
      await run('npm', ['run', 'check']);
      await run('npm', ['run', 'build']);
    }

    publicationStarted = options.publish === 'pr';
    const prUrl = publicationStarted ? await publishPullRequest(options, prepared) : undefined;

    for (const item of prepared) {
      const archivedPath = await moveFile(item.sourcePath, options.processed);
      state.articles[item.identity] = {
        sourceHash: item.sourceHash,
        sourceName: path.basename(item.sourcePath),
        destination: path.relative(repositoryRoot, item.destination),
        importedAt: new Date().toISOString(),
        archivedPath,
        prUrl
      };
    }
    await saveState(state);

    console.log(`Imported ${prepared.length} article${prepared.length === 1 ? '' : 's'} successfully.`);
    if (prUrl) console.log(`Pull request: ${prUrl}`);
  } catch (error) {
    if (!publicationStarted) {
      for (const destination of created) {
        try {
          await unlink(destination);
        } catch (cleanupError) {
          if (cleanupError.code !== 'ENOENT') console.error(`Cleanup failed for ${destination}: ${cleanupError.message}`);
        }
      }
      for (const item of prepared) await rejectSource(item.sourcePath, options.failed, error.message);
    }
    throw error;
  }

  if (rejected > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
