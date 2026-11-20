export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.searchParams.has('debug')) {
      return new Response(JSON.stringify({
        url: request.url,
        hostname: url.hostname,
        pathname: url.pathname,
        headers: Object.fromEntries(request.headers.entries())
      }, null, 2), { headers: { 'content-type': 'application/json' } });
    }

    const host = (request.headers.get('host') || url.hostname).toLowerCase();
    const path = url.pathname.toLowerCase();

    // Check if visiting adg subdomain or /adg /alex paths
    if (host.includes('adg') || path === '/adg' || path === '/alex') {
      if (path === '/' || path === '' || path === '/adg' || path === '/alex') {
        const newHeaders = new Headers(request.headers);
        newHeaders.set('host', 'mvhlsp.site');
        const assetReq = new Request('https://mvhlsp.site/adg.html', {
          method: request.method,
          headers: newHeaders
        });
        return env.ASSETS.fetch(assetReq);
      }
    }

    // Clean routing for /partner and /quickdial
    if (path === '/partner') {
      const assetReq = new Request('https://mvhlsp.site/partner.html', request);
      return env.ASSETS.fetch(assetReq);
    }
    if (path === '/quickdial') {
      const assetReq = new Request('https://mvhlsp.site/quickdial.html', request);
      return env.ASSETS.fetch(assetReq);
    }

    // Default: fetch from static assets
    return env.ASSETS.fetch(request);
  }
};
