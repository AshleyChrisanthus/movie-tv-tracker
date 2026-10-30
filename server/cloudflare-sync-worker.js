/**
 * Standalone Reference Cloudflare Worker for BingeLog E2EE Cloud Sync (Issue #49)
 *
 * Provides zero-knowledge storage for encrypted AES-GCM (256-bit) vault envelopes.
 * The server never sees or stores plaintext media items, watch history, or decryption keys.
 *
 * Prerequisites in Cloudflare Dashboard:
 * 1. Create a KV Namespace named: SYNC_VAULTS
 * 2. Bind KV Namespace to variable: SYNC_VAULTS
 * 3. Deploy this worker script!
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    // CORS preflight supporting file://, localhost, and *.here.now
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Client',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Client',
      'Content-Type': 'application/json'
    };

    // Route: /api/vault/:vaultId
    const match = url.pathname.match(/^\/api\/vault\/([a-zA-Z0-9_-]+)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: corsHeaders
      });
    }

    const vaultId = match[1];

    try {
      if (request.method === 'GET') {
        const rawEnvelope = await env.SYNC_VAULTS.get(`vault:${vaultId}`);
        if (!rawEnvelope) {
          return new Response(JSON.stringify({ error: 'Vault not found' }), {
            status: 404,
            headers: corsHeaders
          });
        }
        return new Response(rawEnvelope, {
          status: 200,
          headers: corsHeaders
        });
      }

      if (request.method === 'PUT') {
        const envelope = await request.json();
        if (!envelope || !envelope.ciphertext || !envelope.iv) {
          return new Response(JSON.stringify({ error: 'Invalid envelope structure' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        // Store encrypted blob in KV with 180-day retention
        await env.SYNC_VAULTS.put(`vault:${vaultId}`, JSON.stringify(envelope), {
          expirationTtl: 60 * 60 * 24 * 180
        });

        return new Response(
          JSON.stringify({
            success: true,
            vaultId,
            updatedAt: new Date().toISOString()
          }),
          {
            status: 200,
            headers: corsHeaders
          }
        );
      }

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        {
          status: 500,
          headers: corsHeaders
        }
      );
    }
  }
};
