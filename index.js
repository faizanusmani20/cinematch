/**
 * CineMatch TMDB Proxy — Cloudflare Worker
 *
 * Purpose: keep the TMDB API key on the server side only. The browser calls
 * THIS worker (no key attached), and the worker attaches the real key
 * before forwarding the request to TMDB. Your key never reaches the client.
 *
 * Any request path/query sent to this worker is forwarded 1:1 to TMDB, e.g.
 *   https://your-worker.workers.dev/discover/movie?sort_by=popularity.desc
 * becomes
 *   https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&api_key=SECRET
 */

const TMDB_BASE = "https://api.themoviedb.org/3";

// Lock this down to your real site once it has a domain, e.g. "https://cinematch.pages.dev"
// Using "*" is fine for local testing / a resume demo.
const ALLOWED_ORIGIN = "*";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (!env.TMDB_API_KEY) {
      return json({ error: "Server misconfigured: TMDB_API_KEY secret is not set." }, 500);
    }

    const incoming = new URL(request.url);

    // Simple in-memory-free rate/abuse guard: only allow GET.
    if (request.method !== "GET") {
      return json({ error: "Only GET is supported." }, 405);
    }

    const tmdbUrl = new URL(TMDB_BASE + incoming.pathname);
    incoming.searchParams.forEach((value, key) => tmdbUrl.searchParams.set(key, value));
    tmdbUrl.searchParams.set("api_key", env.TMDB_API_KEY);
    if (!tmdbUrl.searchParams.has("language")) {
      tmdbUrl.searchParams.set("language", "en-US");
    }

    try {
      const upstream = await fetch(tmdbUrl.toString(), {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 300, cacheEverything: true }, // cache TMDB responses at the edge for 5 min
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    } catch (err) {
      return json({ error: "Upstream request to TMDB failed.", detail: String(err) }, 502);
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
