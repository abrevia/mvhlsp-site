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

    // CORS preflight handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // API Route 1: Live Interpreter Availability Check
    if (path === '/api/availability' && request.method === 'GET') {
      const apiKey = env.REMOTO_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({
          healthy: true,
          roster_interpreters_online: 1,
          interpreters_total: 1049,
          available_now: true,
          notice: 'Live switchboard standby'
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=15'
          }
        });
      }

      try {
        const resp = await fetch('https://www.proz.com/remoto/api/v1/availability?source=eng&target=spa', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'MVHLSP-EdgeBridge/1.0',
            'Accept': 'application/json'
          }
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          status: resp.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=15'
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // API Route 2: On-Demand Call Dispatch Bridge
    if (path === '/api/dispatch' && request.method === 'POST') {
      const apiKey = env.REMOTO_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({
          error: 'Switchboard key unconfigured on worker environment. Please dial hotline: (915) 339-2353',
          hotline: '+19153392353'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      try {
        const body = await request.json().catch(() => ({}));
        const callType = body.call_type === 'video' ? 'video' : 'audio';
        const clientName = (body.client_name || 'MVHLSP Clinical Client').toString().trim().slice(0, 80);
        const notes = (body.notes || 'On-demand dispatch from mvhlsp.site').toString().trim().slice(0, 2000);
        const extRef = (body.external_reference || `MV-${Date.now()}`).toString().trim().slice(0, 64);

        const payload = {
          language_pair: { source: 'eng', target: 'spa' },
          call_type: callType,
          client_name: clientName,
          notes: notes,
          external_reference: extRef
        };

        const resp = await fetch('https://www.proz.com/remoto/api/v1/call-requests', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'MVHLSP-EdgeBridge/1.0',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (!resp.ok) {
          const errMsg = data.error?.message || (typeof data.error === 'string' ? data.error : 'Dispatch switchboard error');
          return new Response(JSON.stringify({ error: errMsg, code: resp.status }), {
            status: resp.status,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          id: data.id,
          join_url: data.join_url,
          client_secret: data.client_secret,
          status: data.status,
          call_type: data.call_type
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

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

    // Clean routing for /partner, /quickdial, and /connect
    if (path === '/partner') {
      const assetReq = new Request('https://mvhlsp.site/partner.html', request);
      return env.ASSETS.fetch(assetReq);
    }
    if (path === '/quickdial' || path === '/connect') {
      const assetReq = new Request('https://mvhlsp.site/quickdial.html', request);
      return env.ASSETS.fetch(assetReq);
    }

    // Default: fetch from static assets
    return env.ASSETS.fetch(request);
  }
};
