# CineMatch TMDB Proxy (Cloudflare Worker)

A tiny serverless backend that hides your TMDB API key. Your CineMatch site
calls this worker; the worker attaches the key and forwards to TMDB.

## 1. Prerequisites
- Free Cloudflare account: https://dash.cloudflare.com/sign-up
- Node.js installed locally
- A free TMDB API key: https://www.themoviedb.org/settings/api

## 2. Install the Cloudflare CLI (Wrangler)
```bash
npm install -g wrangler
wrangler login
```
This opens a browser to authorize Wrangler with your Cloudflare account.

## 3. Add your TMDB key as a secret (never goes in code or git)
From inside this `cloudflare-worker` folder:
```bash
wrangler secret put TMDB_API_KEY
```
Paste your TMDB key when prompted.

## 4. Deploy
```bash
wrangler deploy
```
Wrangler will print a URL like:
```
https://cinematch-proxy.<your-subdomain>.workers.dev
```
That's your backend. Copy it.

## 5. Point the frontend at it
Open `cinematch.html` and set:
```js
const API_PROXY_BASE = "https://cinematch-proxy.<your-subdomain>.workers.dev";
```
(The frontend I gave you already has this constant at the top of the script —
just replace the placeholder value.)

## 6. (Optional but recommended) Lock down CORS
In `src/index.js`, change:
```js
const ALLOWED_ORIGIN = "*";
```
to your real site's origin once it's hosted, e.g.:
```js
const ALLOWED_ORIGIN = "https://cinematch.pages.dev";
```
Then redeploy with `wrangler deploy`.

## Notes
- Cloudflare Workers' free tier gives 100,000 requests/day — plenty for a
  resume demo or portfolio project.
- Responses are cached at Cloudflare's edge for 5 minutes (see `cacheTtl`
  in `src/index.js`), which cuts down on repeat TMDB calls and speeds up
  your site.
- If you ever see 500 errors mentioning "TMDB_API_KEY", it means the secret
  wasn't set — repeat step 3.
