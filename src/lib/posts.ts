import type { CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;

export function postHref(post: PostEntry) {
  const match = post.id.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  if (!match) return '/explore/';

  const [, year, month, day, slug] = match;
  return `/${year}/${month}/${day}/${slug}/`;
}

export function formatPostDate(date: Date, style: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat('en-US', {
    month: style === 'short' ? 'short' : 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

export function readingMinutes(body?: string) {
  return Math.max(1, Math.round((body?.split(/\s+/).filter(Boolean).length ?? 0) / 220));
}
