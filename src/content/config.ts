import { defineCollection, z } from 'astro:content';

const tagSchema = z.array(z.string()).optional();

const postSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('essay'),
    title: z.string(),
    dek: z.string().optional(),
    publishedAt: z.coerce.date(),
    image: z.string().optional(),
    threadId: z.string().optional(),
    tags: tagSchema,
    draft: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('note'),
    publishedAt: z.coerce.date(),
    threadId: z.string().optional(),
    tags: tagSchema,
    draft: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('quote'),
    source: z.string(),
    sourceUrl: z.string().url().optional(),
    publishedAt: z.coerce.date(),
    threadId: z.string().optional(),
    tags: tagSchema,
    draft: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('link'),
    url: z.string().url(),
    title: z.string(),
    source: z.string(),
    ogImage: z.string().optional(),
    publishedAt: z.coerce.date(),
    threadId: z.string().optional(),
    tags: tagSchema,
    draft: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('photo'),
    image: z.string(),
    caption: z.string().optional(),
    publishedAt: z.coerce.date(),
    threadId: z.string().optional(),
    tags: tagSchema,
    draft: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('gallery'),
    images: z.array(z.object({
      src: z.string(),
      caption: z.string().optional(),
    })).min(1),
    publishedAt: z.coerce.date(),
    threadId: z.string().optional(),
    tags: tagSchema,
    draft: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('audio'),
    title: z.string(),
    audioFile: z.string(),
    duration: z.string(),
    context: z.string().optional(),
    transcript: z.string().optional(),
    publishedAt: z.coerce.date(),
    threadId: z.string().optional(),
    tags: tagSchema,
    draft: z.boolean().default(false),
  }),
]);

const posts = defineCollection({ type: 'content', schema: postSchema });

const portfolio = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    year: z.number(),
    serviceCategory: z.string(),
    pitch: z.string(),
    image: z.string().optional(),
    externalUrl: z.string().url().optional(),
    order: z.number().default(0),
  }),
});

const now = defineCollection({
  type: 'data',
  schema: z.object({
    reading: z.object({ title: z.string(), author: z.string() }).optional(),
    brewing: z.string().optional(),
    listening: z.object({ title: z.string(), artist: z.string() }).optional(),
  }),
});

const noticing = defineCollection({
  type: 'data',
  schema: z.object({
    quote: z.string(),
    source: z.string(),
    publishedAt: z.coerce.date(),
  }),
});

const site = defineCollection({
  type: 'data',
  schema: z.object({
    issueNumber: z.number(),
    season: z.string(),
    year: z.string(),
    tagline: z.string().optional(),
  }),
});

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    dek: z.string().optional(),
  }),
});

export const collections = { posts, portfolio, now, noticing, site, pages };
