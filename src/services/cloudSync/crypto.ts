import type { EncryptedVaultEnvelope, DecryptedSyncPayload } from './types';

// Helper: base64 <-> Uint8Array
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Base64URL formatting (RFC 4648) for safe URL hash sharing
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  let str = base64url.trim().replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return base64ToBytes(str);
}

/**
 * Generate a cryptographically secure 256-bit AES-GCM secret key.
 * Returns raw key encoded as Base64URL string (32 bytes / 43 chars).
 */
export async function generateSecretKey(): Promise<string> {
  const rawKey = new Uint8Array(32);
  crypto.getRandomValues(rawKey);
  return bytesToBase64Url(rawKey);
}

/**
 * Generate a random UUID / identifier for the vault (32 hex chars).
 */
export function generateVaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Import a Base64URL string into a Web Crypto CryptoKey for AES-GCM (256-bit).
 */
async function importAesKey(secretKeyBase64Url: string): Promise<CryptoKey> {
  const rawBytes = base64UrlToBytes(secretKeyBase64Url);
  if (rawBytes.byteLength !== 32) {
    throw new Error(`Invalid AES-GCM key length: expected 32 bytes (256 bits), got ${rawBytes.byteLength} bytes`);
  }
  return await crypto.subtle.importKey(
    'raw',
    rawBytes as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a 256-bit AES-GCM key from a human-readable passphrase using PBKDF2
 * (100,000 iterations, SHA-256, 16-byte random salt).
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  saltBytes?: Uint8Array
): Promise<{ secretKey: string; salt: string }> {
  const enc = new TextEncoder();
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));

  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase) as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', derivedKey);
  return {
    secretKey: bytesToBase64Url(new Uint8Array(exported)),
    salt: bytesToBase64(salt)
  };
}

/**
 * Encrypt a DecryptedSyncPayload with AES-GCM 256-bit (128-bit auth tag).
 * Generates a fresh cryptographically random 12-byte IV for every encryption call.
 */
export async function encryptPayload(
  payload: DecryptedSyncPayload,
  secretKeyBase64Url: string,
  deviceId: string,
  salt?: string
): Promise<EncryptedVaultEnvelope> {
  const key = await importAesKey(secretKeyBase64Url);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(JSON.stringify(payload));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128
    },
    key,
    plaintextBytes as unknown as BufferSource
  );

  const envelope: EncryptedVaultEnvelope = {
    v: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    updatedAt: new Date().toISOString(),
    deviceId
  };

  if (salt) {
    envelope.salt = salt;
  }

  return envelope;
}

/**
 * Decrypt an EncryptedVaultEnvelope using AES-GCM 256-bit (128-bit auth tag).
 * Rejects if ciphertext or IV is tampered with or the secret key is wrong.
 */
export async function decryptPayload(
  envelope: EncryptedVaultEnvelope,
  secretKeyBase64Url: string
): Promise<DecryptedSyncPayload> {
  if (!envelope || envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope?.v}`);
  }
  if (!envelope.iv || !envelope.ciphertext) {
    throw new Error('Malformed encrypted vault envelope: missing iv or ciphertext');
  }

  const key = await importAesKey(secretKeyBase64Url);
  const iv = base64ToBytes(envelope.iv);
  const ciphertextBytes = base64ToBytes(envelope.ciphertext);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128
    },
    key,
    ciphertextBytes as unknown as BufferSource
  );

  const decoder = new TextDecoder();
  const jsonStr = decoder.decode(decryptedBuffer);
  return JSON.parse(jsonStr) as DecryptedSyncPayload;
}
