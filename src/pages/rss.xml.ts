import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllPosts } from '~/lib/getAllPosts';

export const prerender = true;

export async function GET(context: APIContext) {
  const posts = await getAllPosts();
  return rss({
    title: 'Blue Studio',
    description: 'Notes and essays by Nina Pfeiffer.',
    site: context.site ?? 'https://bluestudio.space',
    items: posts.map((p) => {
      const data = p.data;
      let title = '';
      let description = '';
      switch (data.type) {
        case 'essay': title = data.title; description = data.dek ?? ''; break;
        case 'note':  title = 'Note'; description = p.body.slice(0, 200); break;
        case 'quote': title = `Quote: ${data.source}`; description = p.body; break;
        case 'link':  title = `Link: ${data.title}`; description = p.body.slice(0, 200); break;
        case 'photo': title = 'Photo'; description = data.caption ?? ''; break;
        case 'gallery': title = `Gallery (${data.images.length} photos)`; description = data.images[0]?.caption ?? ''; break;
        case 'audio': title = `Voice memo: ${data.title}`; description = data.transcript ?? p.body; break;
      }
      return {
        title,
        description,
        link: `/journal/${p.slug}/`,
        pubDate: data.publishedAt,
      };
    }),
    customData: '<language>en-us</language>',
  });
}
