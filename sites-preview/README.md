# Freebuff Sites preview

This folder holds the Worker and the manifest for the Freebuff Sites preview deployment. It is separate
from the `_redirects` and `vercel.json` files, which are for Netlify, Cloudflare Pages and Vercel.

- Site ID: `467484fa-b543-40d5-a8b2-c8f22de38484`
- Preview URL: https://site-d42658630e06403587a2e4d596c4d19b.freebuff.page

## Deploy the preview

1. Build the app from the repository root.

   ```bash
   npm run build
   ```

2. Copy the build into this folder. The Sites deploy tool reads the assets from inside the manifest
   folder, so the copy is necessary.

   ```bash
   cd apps/web
   cp -r dist "../../sites-preview/public"
   ```

3. Deploy `sites-preview/manifest.json` with the preview environment. The deploy tool rejects the
   `_redirects` file in the asset folder, so remove it from `public` before the deploy.

   ```bash
   rm sites-preview/public/_redirects
   ```

4. Publish the preview environment.

`public/` is build output. It stays out of version control.

## What the Worker does

`worker.mjs` serves a file when the path matches one. For every other GET path without a file
extension it returns `index.html` with status 200. That makes `/providers`, `/security` and `/app` work
on a direct visit. A missing asset keeps its 404.

## The hosted model

`/api/ai/v1/models` and `/api/ai/v1/chat/completions` are the one server route. The Worker forwards an
OpenAI-shaped body to the Workers AI REST API and returns its stream, so the browser keeps the
`openai-chat` wire format. Three models are allowed, `max_tokens` is clamped to 700, and every call is
counted in D1 before it runs.

The route needs three secrets, set in Sites → Secrets:

| Name | Value |
|---|---|
| `CF_ACCOUNT_ID` | The Cloudflare account id that owns Workers AI. |
| `CF_AI_TOKEN` | An API token with the Workers AI Read and Edit permissions. |
| `HOSTED_IP_SALT` | Any long random text, used to hash an address. |

Until all three are set, both paths return 503 with "The hosted model is not set up on this site."
A missing `DB` binding returns the same 503, so the route never runs uncapped.

The counters live in `hosted_usage`, which the Worker creates on the first call: 30 requests a day for
each install, 120 for each address, and 500 for the site. The route has no sign-in gate, so the site
wide cap is the real ceiling.
