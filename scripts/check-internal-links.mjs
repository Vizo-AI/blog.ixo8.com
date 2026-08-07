import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('dist');
const files = await readdir(outputDirectory, { recursive: true });
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const failures = [];

function outputPathFor(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const relativePath = decodedPath.replace(/^\/+/, '');

  if (!relativePath) return path.join(outputDirectory, 'index.html');
  if (decodedPath.endsWith('/')) return path.join(outputDirectory, relativePath, 'index.html');
  return path.join(outputDirectory, relativePath);
}

for (const file of htmlFiles) {
  const sourcePath = path.join(outputDirectory, file);
  const html = await readFile(sourcePath, 'utf8');
  const references = html.matchAll(/(?:href|src)=["']([^"']+)["']/g);

  for (const [, reference] of references) {
    if (!reference.startsWith('/') || reference.startsWith('//')) continue;

    const urlPath = reference.split(/[?#]/, 1)[0];
    if (!urlPath) continue;

    const targetPath = outputPathFor(urlPath);
    try {
      await access(targetPath);
    } catch {
      failures.push(`${file}: ${reference}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Internal link check failed for ${failures.length} reference(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Internal links verified across ${htmlFiles.length} HTML page(s).`);
}
