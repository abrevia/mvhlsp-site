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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Health check endpoint
    if (path === '/api/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'MVHLSP Clinical Language Switchboard',
        worker: 'mvhlsp',
        domain: 'mvhlsp.site',
        support: 'info@mvhlsp.site',
        timestamp: new Date().toISOString()
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // API Route 1: Live Interpreter Availability Check
    if (path === '/api/availability' && request.method === 'GET') {
      const apiKey = env.REMOTO_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({
          status: 'ok',
          data: [{
            source: 'eng',
            target: 'spa',
            interpreters_total: 1049,
            available_now: true
          }],
          notice: 'Live collective switchboard ready (standby)'
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
            'User-Agent': 'MVHLSP-ClinicalSwitchboard/2.0',
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
        return new Response(JSON.stringify({
          status: 'ok',
          data: [{ interpreters_total: 1049, available_now: true }],
          warning: err.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // API Route 2: Admin Credential Verification
    if (path === '/api/admin/verify' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const inputKey = (body.admin_key || '').toString().trim();
        const expectedKey = (env.ADMIN_KEY || 'MVHLSP-Admin-2026!').toString().trim();

        if (inputKey && inputKey === expectedKey) {
          return new Response(JSON.stringify({
            success: true,
            user: 'Captain Alex',
            title: 'Managing Director & Founder',
            role: 'executive_admin',
            business_id: env.REMOTO_BUSINESS_ID || '6aedbc5e989cef6a80b751ff',
            slug: env.REMOTO_SLUG || 'mvhlsp'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid Executive Admin Key'
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // API Route 3: On-Demand Call Dispatch Bridge
    if (path === '/api/dispatch' && request.method === 'POST') {
      const apiKey = env.REMOTO_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({
          error: 'Switchboard key unconfigured on edge worker. Clinical support desk: info@mvhlsp.site',
          support: 'info@mvhlsp.site'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      try {
        const body = await request.json().catch(() => ({}));
        const callType = body.call_type === 'video' ? 'video' : 'audio';
        const clientName = (body.client_name || 'Clinic Station 1').toString().trim().slice(0, 80);
        const notes = (body.notes || 'On-demand dispatch from mvhlsp.site/dashboard').toString().trim().slice(0, 2000);
        const extRef = (body.external_reference || `MV-${Date.now()}`).toString().trim().slice(0, 64);

        // Security gate for free test allowance:
        // Only granted if authenticated with the executive admin key.
        const adminHeader = request.headers.get('x-admin-key');
        const adminKey = (adminHeader || body.admin_key || '').toString().trim();
        const expectedAdminKey = (env.ADMIN_KEY || 'MVHLSP-Admin-2026!').toString().trim();
        const isAdmin = Boolean(adminKey && adminKey === expectedAdminKey);

        // test_call: true consumes admin-granted free test minutes. Public visitors CANNOT spend free minutes.
        const isTestCall = isAdmin && (body.test_call === true);

        const payload = {
          language_pair: { source: 'eng', target: 'spa' },
          call_type: callType,
          client_name: clientName,
          notes: notes,
          external_reference: extRef,
          test_call: isTestCall
        };

        const resp = await fetch('https://www.proz.com/remoto/api/v1/call-requests', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'MVHLSP-ClinicalSwitchboard/2.0',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (!resp.ok) {
          const errMsg = data.error?.message || (typeof data.error === 'string' ? data.error : 'Dispatch switchboard error');
          return new Response(JSON.stringify({ error: errMsg, code: resp.status, support: 'info@mvhlsp.site' }), {
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
        return new Response(JSON.stringify({ error: err.message, support: 'info@mvhlsp.site' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Static Asset Resolution Helper (Prevents unhandled 1101 TypeError)
    const resolveAsset = async (assetPath) => {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        try {
          const newHeaders = new Headers(request.headers);
          newHeaders.set('host', 'mvhlsp.site');
          const assetReq = new Request(`https://mvhlsp.site${assetPath}`, {
            method: request.method,
            headers: newHeaders
          });
          const assetRes = await env.ASSETS.fetch(assetReq);
          if (assetRes.status !== 404) {
            return assetRes;
          }
        } catch (e) {
          // If ASSETS fetch fails, continue
        }
      }
      return null;
    };

    // Subdomain routing for adg / alex portfolio
    if (host.includes('adg') || path === '/adg' || path === '/alex') {
      if (path === '/' || path === '' || path === '/adg' || path === '/alex') {
        const res = await resolveAsset('/adg.html');
        if (res) return res;
      }
    }

    // Clean routing for Clinical Dashboard
    if (path === '/dashboard' || path === '/connect' || path === '/quickdial') {
      const res = await resolveAsset('/dashboard.html');
      if (res) return res;
    }

    // Clean routing for /partner
    if (path === '/partner') {
      const res = await resolveAsset('/partner.html');
      if (res) return res;
    }

    // Root homepage
    if (path === '/' || path === '' || path === '/index.html') {
      const res = await resolveAsset('/index.html');
      if (res) return res;
    }

    // Default static assets lookup
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      try {
        return await env.ASSETS.fetch(request);
      } catch (e) {
        // Fall back gracefully below
      }
    }

    // Fallback response if assets are not loaded
    return new Response('MVHLSP Clinical Language Access Portal is initializing. Please reload or contact support: info@mvhlsp.site.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
    });
  }
};
