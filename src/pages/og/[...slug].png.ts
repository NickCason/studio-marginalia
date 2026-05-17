import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

export async function getStaticPaths() {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.map((p) => ({ params: { slug: p.slug }, props: { post: p } }));
}

// Strip non-Latin / unusual punctuation so satori never trips on missing glyphs.
// Curly quotes / em-dashes / ellipses get folded to ASCII equivalents.
function asciiClean(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .trim();
}

export const GET: APIRoute = async ({ props }) => {
  // Imports are dynamic so the Cloudflare worker bundle never has to resolve
  // the resvg native `.node` binary. This route only runs at build time
  // (prerender=true) where Node can load it.
  const [{ Resvg }, { default: satori }, { ogJsx }, { default: fs }, { default: path }] = await Promise.all([
    import('@resvg/resvg-js'),
    import('satori'),
    import('~/lib/og/render'),
    import('node:fs/promises'),
    import('node:path'),
  ]);

  const post = (props as { post: any }).post;
  let title = '';
  switch (post.data.type) {
    case 'essay':
    case 'audio':
    case 'link':  title = post.data.title ?? ''; break;
    case 'quote': title = `"${(post.body ?? '').toString().trim().replace(/^["“]|["”]$/g, '').slice(0, 100)}"`; break;
    case 'note':  title = (post.body ?? '').toString().trim().slice(0, 120); break;
    case 'photo': title = post.data.caption ?? 'Photo'; break;
    default:      title = 'Blue Studio';
  }
  if (!title) title = 'Blue Studio';
  title = asciiClean(title);

  const fontPath = path.resolve('public/fonts/Fraunces-Italic.ttf');
  const fontData = await fs.readFile(fontPath);
  const year = new Date(post.data.publishedAt).getFullYear();

  const svg = await satori(ogJsx({ title, type: post.data.type.toUpperCase(), year }) as any, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Fraunces', data: fontData, weight: 400, style: 'italic' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
