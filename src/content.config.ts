import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './_posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    updated: z.coerce.date().optional(),
    topics: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    authors: z.array(z.string()).default(['Vizo AI']),
    hero: z.string().optional(),
    hero_alt: z.string().optional(),
    sources: z.array(z.string()).default([]),
    source_count: z.number().int().nonnegative().optional(),
    fact_checked_at: z.coerce.date().optional(),
    editorial_status: z.string().optional(),
    generated_with_ai: z.boolean().default(true),
    featured: z.boolean().default(false),
    layout: z.string().optional()
  })
});

export const collections = { posts };
