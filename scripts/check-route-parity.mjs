import { access, readdir } from 'node:fs/promises';
import path from 'node:path';

const postsDirectory = path.resolve('_posts');
const outputDirectory = path.resolve('dist');
const postPattern = /^(\d{4})-(\d{2})-(\d{2})-(.+)\.(?:md|markdown)$/i;

const files = await readdir(postsDirectory, { recursive: true });
const postFiles = files.filter((file) => /\.(?:md|markdown)$/i.test(file));
const failures = [];

for (const file of postFiles) {
  const match = path.basename(file).match(postPattern);

  if (!match) {
    failures.push(`${file}: expected YYYY-MM-DD-slug.md`);
    continue;
  }

  const [, year, month, day, slug] = match;
  const outputPath = path.join(outputDirectory, year, month, day, slug, 'index.html');

  try {
    await access(outputPath);
  } catch {
    failures.push(`${file}: missing ${path.relative(process.cwd(), outputPath)}`);
  }
}

if (failures.length > 0) {
  console.error(`Route parity failed for ${failures.length} post(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Route parity verified for ${postFiles.length} post(s).`);
}
