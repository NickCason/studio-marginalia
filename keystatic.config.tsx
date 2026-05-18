import { config, collection, singleton, fields } from '@keystatic/core';
import { audioRecorder } from './src/lib/keystatic-fields/audioRecorder';
import { BrandMark } from './src/lib/keystatic-ui/BrandMark';

const mediaImage = (label: string, description?: string) =>
  fields.image({
    label,
    description,
    directory: 'public/media',
    publicPath: '/media/',
    validation: { isRequired: false },
  });

const mediaFile = (label: string, directory: string, publicPath: string) =>
  fields.file({
    label,
    directory,
    publicPath,
    validation: { isRequired: false },
  });

const postTypeField = fields.select({
  label: 'Post type',
  description:
    'Pick the type FIRST. Then fill in fields tagged with that type — others will be ignored by the build.',
  options: [
    { label: 'Essay (longform)', value: 'essay' },
    { label: 'Note (one paragraph)', value: 'note' },
    { label: 'Quote', value: 'quote' },
    { label: 'Link', value: 'link' },
    { label: 'Photo', value: 'photo' },
    { label: 'Gallery (multi-photo)', value: 'gallery' },
    { label: 'Voice memo', value: 'audio' },
  ],
  defaultValue: 'note',
});

export default config({
  storage:
    process.env.KEYSTATIC_STORAGE === 'local'
      ? { kind: 'local' }
      : {
          kind: 'github',
          repo: { owner: 'NickCason', name: 'blue-studio' },
        },

  ui: {
    brand: { name: 'Blue Studio', mark: BrandMark },
    navigation: {
      Content: ['posts', 'portfolio', 'noticing'],
      'Site state': ['now', 'site', 'aboutPage'],
    },
  },

  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'slug',
      path: 'src/content/posts/**',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['type', 'publishedAt'],
      schema: {
        slug: fields.slug({
          name: { label: 'Filename slug', description: 'URL-safe; becomes /journal/<slug>/' },
        }),
        type: postTypeField,
        publishedAt: fields.datetime({ label: 'Published at' }),
        draft: fields.checkbox({ label: 'Draft (hide from feed)', defaultValue: false }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (props) => props.value,
        }),
        threadId: fields.text({
          label: 'Thread ID (optional, e.g. notes-from-the-build)',
          validation: { isRequired: false },
        }),

        title: fields.text({
          label: '[ESSAY · LINK · VOICE MEMO] Title',
          validation: { isRequired: false },
        }),

        dek: fields.text({
          label: '[ESSAY] Dek (subtitle)',
          multiline: true,
          validation: { isRequired: false },
        }),

        image: mediaImage('[PHOTO required · ESSAY optional] Image'),

        source: fields.text({
          label: '[QUOTE · LINK] Source',
          validation: { isRequired: false },
        }),
        sourceUrl: fields.url({
          label: '[QUOTE] Source URL (optional)',
          validation: { isRequired: false },
        }),

        url: fields.url({
          label: '[LINK] URL',
          validation: { isRequired: false },
        }),
        ogImage: mediaImage('[LINK] OG image (optional)'),

        caption: fields.text({
          label: '[PHOTO] Caption',
          multiline: true,
          validation: { isRequired: false },
        }),

        images: fields.array(
          fields.object({
            src: fields.image({
              label: '[GALLERY] Image',
              directory: 'public/media',
              publicPath: '/media/',
              validation: { isRequired: true },
            }),
            caption: fields.text({
              label: 'Caption (optional)',
              validation: { isRequired: false },
            }),
          }),
          {
            label: '[GALLERY] Images',
            itemLabel: (props) =>
              props.fields.caption.value || props.fields.src.value?.filename || '(image)',
          },
        ),

        audioFile: audioRecorder({
          label: '[VOICE MEMO] Audio file',
          description: 'Record in the browser or upload a file. Saved to /media/.',
          directory: 'public/media',
          publicPath: '/media/',
          validation: { isRequired: false },
        }),
        duration: fields.text({
          label: '[VOICE MEMO] Duration mm:ss',
          validation: { isRequired: false },
        }),
        context: fields.text({
          label: '[VOICE MEMO] Context line (e.g. "in the car")',
          validation: { isRequired: false },
        }),
        transcript: fields.text({
          label: '[VOICE MEMO] Transcript',
          multiline: true,
          validation: { isRequired: false },
        }),

        body: fields.markdoc({ label: 'Body', extension: 'md' }),
      },
    }),

    portfolio: collection({
      label: 'Portfolio',
      slugField: 'slug',
      path: 'src/content/portfolio/**',
      format: { contentField: 'body' },
      schema: {
        slug: fields.slug({ name: { label: 'Filename slug' } }),
        name: fields.text({ label: 'Client name' }),
        year: fields.integer({ label: 'Year' }),
        serviceCategory: fields.text({
          label: 'Service category',
          validation: { isRequired: false },
        }),
        pitch: fields.text({ label: 'One-line pitch' }),
        image: mediaImage('Card image (optional)'),
        externalUrl: fields.url({
          label: 'External link (optional)',
          validation: { isRequired: false },
        }),
        order: fields.integer({ label: 'Display order (lower = earlier)', defaultValue: 0 }),
        body: fields.markdoc({ label: 'Body', extension: 'md' }),
      },
    }),

    noticing: collection({
      label: 'Noticing',
      slugField: 'slug',
      path: 'src/content/noticing/**',
      format: 'json',
      schema: {
        slug: fields.slug({ name: { label: 'Filename slug' } }),
        quote: fields.text({ label: 'Quote / observation' }),
        source: fields.text({ label: 'Source / context' }),
        publishedAt: fields.date({ label: 'Date' }),
      },
    }),
  },

  singletons: {
    now: singleton({
      label: 'On her desk (now)',
      path: 'src/content/now/now',
      format: 'json',
      schema: {
        reading: fields.object(
          {
            title: fields.text({ label: 'Title', validation: { isRequired: false } }),
            author: fields.text({ label: 'Author', validation: { isRequired: false } }),
          },
          { label: 'Reading' },
        ),
        brewing: fields.text({
          label: 'Brewing',
          multiline: true,
          validation: { isRequired: false },
        }),
        listening: fields.object(
          {
            title: fields.text({ label: 'Title', validation: { isRequired: false } }),
            artist: fields.text({ label: 'Artist', validation: { isRequired: false } }),
          },
          { label: 'Listening' },
        ),
      },
    }),

    site: singleton({
      label: 'Site config',
      path: 'src/content/site/site',
      format: 'json',
      schema: {
        issueNumber: fields.integer({ label: 'Issue number' }),
        season: fields.text({ label: 'Season (Spring/Summer/Fall/Winter)' }),
        year: fields.text({ label: 'Year label (e.g. "year one")' }),
        tagline: fields.text({ label: 'Tagline (optional)', validation: { isRequired: false } }),
      },
    }),

    aboutPage: singleton({
      label: 'About page',
      path: 'src/content/pages/about',
      format: { contentField: 'body' },
      schema: {
        title: fields.text({ label: 'Page title' }),
        dek: fields.text({ label: 'Subtitle (optional)', validation: { isRequired: false } }),
        body: fields.markdoc({ label: 'Body', extension: 'md' }),
      },
    }),
  },
});
