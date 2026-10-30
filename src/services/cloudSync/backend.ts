import type { EncryptedVaultEnvelope, SyncConfig } from './types';

export interface CloudLockerAdapter {
  get(vaultId: string): Promise<EncryptedVaultEnvelope | null>;
  put(vaultId: string, envelope: EncryptedVaultEnvelope): Promise<boolean>;
}

/**
 * Zero-Config Public REST Relay Fallback
 * Uses public REST storage endpoint for instant zero-configuration testing and syncing.
 * Note: Data is 100% client-side encrypted with AES-GCM (256-bit) before leaving browser memory.
 */
export class RestfulApiRelayLocker implements CloudLockerAdapter {
  private endpoint = 'https://api.restful-api.dev/objects';

  async get(vaultId: string): Promise<EncryptedVaultEnvelope | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${this.endpoint}/${encodeURIComponent(vaultId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });

      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Cloud relay returned HTTP ${res.status}`);
      }

      const json = (await res.json()) as { data?: EncryptedVaultEnvelope };
      if (json && json.data) {
        return json.data;
      }
      return null;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Cloud sync request timed out (10s)');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async put(vaultId: string, envelope: EncryptedVaultEnvelope): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const putRes = await fetch(`${this.endpoint}/${encodeURIComponent(vaultId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `bingelog_vault_${vaultId.slice(0, 8)}`,
          data: envelope
        }),
        signal: controller.signal
      });

      if (putRes.ok) return true;

      if (putRes.status === 404) {
        const postRes = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `bingelog_vault_${vaultId.slice(0, 8)}`,
            data: envelope
          }),
          signal: controller.signal
        });
        if (postRes.ok) return true;
      }

      throw new Error(`Cloud relay write failed (HTTP ${putRes.status})`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Cloud sync upload timed out (10s)');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async createVault(envelope: EncryptedVaultEnvelope): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'bingelog_vault',
          data: envelope
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Could not initialize cloud vault: HTTP ${res.status}`);
      }
      const json = (await res.json()) as { id: string };
      return json.id;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Cloud relay initialization timed out (10s)');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Custom Serverless / Cloudflare Worker Locker
 * Follows REST convention:
 *   GET  <endpoint>/api/vault/:vaultId
 *   PUT  <endpoint>/api/vault/:vaultId
 */
export class CustomWorkerLocker implements CloudLockerAdapter {
  private endpoint: string;
  private authHeader?: string;

  constructor(endpoint: string, authHeader?: string) {
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.authHeader = authHeader;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-App-Client': 'BingeLog-E2EE-v1'
    };
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader.startsWith('Bearer ')
        ? this.authHeader
        : `Bearer ${this.authHeader}`;
    }
    return headers;
  }

  async get(vaultId: string): Promise<EncryptedVaultEnvelope | null> {
    const url = `${this.endpoint}/api/vault/${encodeURIComponent(vaultId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal
      });

      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new Error(`Cloud locker returned HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as EncryptedVaultEnvelope;
      return data;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Cloud sync request timed out (10s)');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async put(vaultId: string, envelope: EncryptedVaultEnvelope): Promise<boolean> {
    const url = `${this.endpoint}/api/vault/${encodeURIComponent(vaultId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(envelope),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Cloud locker update failed (HTTP ${res.status}): ${res.statusText}`);
      }
      return true;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Cloud sync upload timed out (10s)');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Supabase Locker Adapter
 * Uses standard PostgREST table:
 *   create table sync_vaults (
 *     vault_id text primary key,
 *     envelope jsonb not null,
 *     updated_at timestamptz default now()
 *   );
 */
export class SupabaseLocker implements CloudLockerAdapter {
  private url: string;
  private anonKey: string;

  constructor(supabaseUrl: string, anonKey: string) {
    this.url = supabaseUrl.replace(/\/+$/, '');
    this.anonKey = anonKey;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      Prefer: 'return=representation'
    };
  }

  async get(vaultId: string): Promise<EncryptedVaultEnvelope | null> {
    const endpoint = `${this.url}/rest/v1/sync_vaults?vault_id=eq.${encodeURIComponent(vaultId)}&select=envelope`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Supabase query failed: HTTP ${res.status}`);
    }

    const rows = (await res.json()) as Array<{ envelope?: EncryptedVaultEnvelope }>;
    if (Array.isArray(rows) && rows.length > 0 && rows[0].envelope) {
      return rows[0].envelope;
    }
    return null;
  }

  async put(vaultId: string, envelope: EncryptedVaultEnvelope): Promise<boolean> {
    const endpoint = `${this.url}/rest/v1/sync_vaults`;
    const headers: Record<string, string> = {
      ...this.getHeaders(),
      Prefer: 'resolution=merge-duplicates'
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        vault_id: vaultId,
        envelope,
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok) {
      throw new Error(`Supabase upsert failed: HTTP ${res.status}`);
    }
    return true;
  }
}

export const DEFAULT_CLOUDFLARE_WORKER_URL = 'https://app-directory-sync.ashleychrisanthus.workers.dev';

/**
 * Factory to instantiate the appropriate adapter based on config.
 */
export function createLockerAdapter(config: SyncConfig): CloudLockerAdapter {
  if (config.provider === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
    return new SupabaseLocker(config.supabaseUrl, config.supabaseAnonKey);
  }
  if (config.provider === 'relay') {
    return new RestfulApiRelayLocker();
  }

  const endpoint = config.customEndpoint || DEFAULT_CLOUDFLARE_WORKER_URL;
  return new CustomWorkerLocker(endpoint, config.customAuthHeader);
}
