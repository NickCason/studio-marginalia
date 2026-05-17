// TEMPORARY DIAGNOSTIC WRAPPER — remove once OAuth is working.
// Intercepts /api/keystatic/github/oauth/callback to surface the actual
// GitHub access_token response instead of swallowing it as "Authorization
// failed". Falls through to the real KeyStatic handler for everything else.
import type { APIContext, APIRoute } from 'astro';
import { makeHandler } from '@keystatic/astro/api';
import config from '../../../../keystatic.config';

export const prerender = false;

const keystaticHandler = makeHandler({ config });

function readEnv(ctx: APIContext, name: string): string | undefined {
  const cfEnv = (ctx.locals as any)?.runtime?.env;
  if (cfEnv && cfEnv[name]) return cfEnv[name];
  try {
    // @ts-expect-error import.meta.env is Vite's surface
    return import.meta.env[name];
  } catch {
    return undefined;
  }
}

function summarize(name: string, value: string | undefined) {
  if (!value)
    return { name, present: false };
  return {
    name,
    present: true,
    length: value.length,
    prefix: value.slice(0, 6),
    suffix: value.slice(-3),
    hasWhitespace: /\s/.test(value),
  };
}

export const ALL: APIRoute = async (ctx) => {
  const url = new URL(ctx.request.url);

  if (url.pathname.replace(/\/$/, '').endsWith('/github/oauth/callback')) {
    const code = url.searchParams.get('code');
    const errorParam = url.searchParams.get('error');
    const clientId = readEnv(ctx, 'KEYSTATIC_GITHUB_CLIENT_ID');
    const clientSecret = readEnv(ctx, 'KEYSTATIC_GITHUB_CLIENT_SECRET');
    const ksSecret = readEnv(ctx, 'KEYSTATIC_SECRET');

    const diagnostic: Record<string, unknown> = {
      _note: 'DIAGNOSTIC — temporary wrapper. Remove after debugging.',
      callbackUrlReceived: url.toString().replace(/code=[^&]+/, 'code=REDACTED'),
      githubErrorParam: errorParam ?? null,
      env: {
        clientId: summarize('KEYSTATIC_GITHUB_CLIENT_ID', clientId),
        clientSecret: summarize('KEYSTATIC_GITHUB_CLIENT_SECRET', clientSecret),
        ksSecret: summarize('KEYSTATIC_SECRET', ksSecret),
      },
    };

    if (code && clientId && clientSecret) {
      const tokenUrl = new URL('https://github.com/login/oauth/access_token');
      tokenUrl.searchParams.set('client_id', clientId);
      tokenUrl.searchParams.set('client_secret', clientSecret);
      tokenUrl.searchParams.set('code', code);
      try {
        const tokenRes = await fetch(tokenUrl.toString(), {
          method: 'POST',
          headers: { Accept: 'application/json' },
        });
        const bodyText = await tokenRes.text();
        diagnostic.exchange = {
          status: tokenRes.status,
          statusText: tokenRes.statusText,
          body: bodyText.length < 2000 ? bodyText : bodyText.slice(0, 2000) + '... (truncated)',
        };
      } catch (e) {
        diagnostic.exchange = {
          fetchError: String(e),
        };
      }
    } else {
      diagnostic.exchange = { skipped: 'missing code, clientId, or clientSecret' };
    }

    return new Response(JSON.stringify(diagnostic, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return keystaticHandler(ctx);
};
