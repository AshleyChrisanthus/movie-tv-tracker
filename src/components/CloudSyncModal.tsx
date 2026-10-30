import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Cloud,
  ShieldCheck,
  QrCode,
  Camera,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  PlusCircle,
  Link2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Server,
  Key,
  Smartphone,
  Eye,
  EyeOff,
  UploadCloud,
  DownloadCloud
} from 'lucide-react';
import {
  syncManager,
  formatSyncRelativeTime,
  generateQrSvg,
  QrCameraScanner,
  DEFAULT_CLOUDFLARE_WORKER_URL,
  type SyncStatus,
  type SyncConfig,
  type SyncProviderType
} from '../services/cloudSync';

export interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSynced?: () => void;
}

export default function CloudSyncModal({
  isOpen,
  onClose,
  onSynced
}: CloudSyncModalProps): React.JSX.Element | null {
  const [status, setStatus] = useState<SyncStatus>(() => syncManager.getStatus());
  const [config, setConfig] = useState<SyncConfig | null>(() => syncManager.getConfig());
  const [viewStep, setViewStep] = useState<'choices' | 'join'>('choices');

  // Create/Join form state
  const [provider, setProvider] = useState<SyncProviderType>('custom');
  const [customEndpoint, setCustomEndpoint] = useState<string>(DEFAULT_CLOUDFLARE_WORKER_URL);
  const [customAuthHeader, setCustomAuthHeader] = useState<string>('');
  const [supabaseUrl, setSupabaseUrl] = useState<string>('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>('');
  const [passphrase, setPassphrase] = useState<string>('');
  const [showAdvancedProvider, setShowAdvancedProvider] = useState<boolean>(false);

  const [pairingInput, setPairingInput] = useState<string>('');
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedField, setCopiedField] = useState<'url' | 'key' | 'vault' | null>(null);
  const [showQrPanel, setShowQrPanel] = useState<boolean>(true);
  const [revealSecretKey, setRevealSecretKey] = useState<boolean>(false);

  // Camera scanner state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrCameraScanner | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current = null;
      }
      setIsScanning(false);
      setNotice(null);
      setViewStep('choices');
      return;
    }

    setConfig(syncManager.getConfig());
    setStatus(syncManager.getStatus());

    const unsubscribe = syncManager.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setConfig(syncManager.getConfig());
    });

    return () => {
      unsubscribe();
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isConfigured = syncManager.isConfigured() && !!config;

  const handleCreateVault = async () => {
    setIsWorking(true);
    setNotice(null);
    try {
      const created = await syncManager.createNewVault({
        provider,
        customEndpoint: provider === 'custom' ? customEndpoint : undefined,
        customAuthHeader: customAuthHeader.trim() || undefined,
        supabaseUrl: provider === 'supabase' ? supabaseUrl.trim() : undefined,
        supabaseAnonKey: provider === 'supabase' ? supabaseAnonKey.trim() : undefined,
        passphrase: passphrase.trim() || undefined
      });
      setConfig(created);
      setShowQrPanel(true);
      setNotice({
        type: 'success',
        message: 'Encrypted Sync Vault created! Scan the QR code below with your phone to pair in 1 second.'
      });
      onSynced?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNotice({ type: 'error', message: `Failed to create vault: ${msg}` });
    } finally {
      setIsWorking(false);
    }
  };

  const handleStartCamera = async () => {
    if (isScanning) {
      scannerRef.current?.stop();
      scannerRef.current = null;
      setIsScanning(false);
      return;
    }

    if (!QrCameraScanner.isSupported()) {
      setNotice({
        type: 'error',
        message: 'Camera QR scanner is not supported on this browser. Please paste the pairing link or use your native phone camera app.'
      });
      return;
    }

    setIsScanning(true);
    setNotice(null);

    setTimeout(async () => {
      if (!videoRef.current) return;
      const scanner = new QrCameraScanner();
      scannerRef.current = scanner;
      await scanner.start(videoRef.current, {
        onDetected: (scannedText) => {
          setPairingInput(scannedText);
          setIsScanning(false);
          setNotice({
            type: 'success',
            message: 'QR code scanned! Connecting to encrypted vault...'
          });
          void handleJoinWithInput(scannedText);
        },
        onError: (errMsg) => {
          setIsScanning(false);
          setNotice({ type: 'error', message: `Camera error: ${errMsg}` });
        }
      });
    }, 50);
  };

  const handleJoinWithInput = async (rawOverride?: string) => {
    const raw = (rawOverride ?? pairingInput).trim();
    if (!raw) {
      setNotice({
        type: 'error',
        message: 'Please paste a pairing link (#sync=v1:...) or vaultId:secretKey.'
      });
      return;
    }

    const parsed = syncManager.parsePairingInput(raw);
    if (!parsed) {
      setNotice({
        type: 'error',
        message: 'Invalid pairing format. Expected a BingeLog pairing link or vaultId:secretKey.'
      });
      return;
    }

    setIsWorking(true);
    setNotice(null);
    try {
      const joined = syncManager.joinVault(
        parsed.vaultId,
        parsed.secretKey,
        parsed.provider || provider,
        parsed.customEndpoint || customEndpoint,
        {
          customAuthHeader: customAuthHeader.trim() || undefined,
          supabaseUrl: supabaseUrl.trim() || undefined,
          supabaseAnonKey: supabaseAnonKey.trim() || undefined
        }
      );
      setConfig(joined);
      await syncManager.syncNow();
      setConfig(syncManager.getConfig());
      setNotice({
        type: 'success',
        message: 'Device paired and library synchronized with zero-knowledge encryption!'
      });
      onSynced?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNotice({ type: 'error', message: `Pairing sync failed: ${msg}` });
    } finally {
      setIsWorking(false);
    }
  };

  const handleSyncNow = async () => {
    setIsWorking(true);
    setNotice(null);
    try {
      await syncManager.syncNow();
      setNotice({
        type: 'success',
        message: 'Library synchronized across devices!'
      });
      onSynced?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNotice({ type: 'error', message: `Sync error: ${msg}` });
    } finally {
      setIsWorking(false);
    }
  };

  const handlePushToCloud = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        '⚠️ Overwrite Cloud Vault?\n\nThis will push your current local library to the cloud vault, completely overwriting remote data. Any other devices paired to this vault will receive this clean state on their next sync.\n\nProceed?'
      )
    ) {
      return;
    }
    setIsWorking(true);
    setNotice(null);
    try {
      await syncManager.pushToCloud({ forceOverwrite: true });
      setNotice({
        type: 'success',
        message: '☁️ Cloud vault successfully overwritten with your current local library! Other devices will receive this clean state.'
      });
      onSynced?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNotice({ type: 'error', message: `Push to cloud failed: ${msg}` });
    } finally {
      setIsWorking(false);
    }
  };

  const handlePullFromCloud = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        '⚠️ Overwrite Local Library?\n\nThis will download the data currently stored in your cloud vault and replace your local library on this device. Any unsynced local changes will be replaced.\n\nProceed?'
      )
    ) {
      return;
    }
    setIsWorking(true);
    setNotice(null);
    try {
      await syncManager.pullFromCloud({ forceOverwrite: true });
      setNotice({
        type: 'success',
        message: '📥 Local library successfully overwritten with cloud vault data!'
      });
      onSynced?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNotice({ type: 'error', message: `Pull from cloud failed: ${msg}` });
    } finally {
      setIsWorking(false);
    }
  };

  const handleDisconnect = () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Disconnect from E2EE Cloud Sync on this device? Your local library in IndexedDB will remain untouched.'
      )
    ) {
      return;
    }
    syncManager.disconnectVault();
    setConfig(null);
    setViewStep('choices');
    setNotice({
      type: 'success',
      message: 'Cloud Sync disconnected. Local library remains intact.'
    });
  };

  const copyToClipboard = (text: string, field: 'url' | 'key' | 'vault') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      });
    }
  };

  const pairingUrl = isConfigured ? syncManager.getPairingUrl() : '';
  let qrSvg = '';
  if (isConfigured && pairingUrl) {
    try {
      qrSvg = generateQrSvg(pairingUrl, { padding: 2, color: '#ffffff', background: '#0f172a' });
    } catch (err) {
      console.warn('[CloudSyncModal] QR generation error:', err);
    }
  }

  const renderStatusBadge = () => {
    if (status.state === 'syncing' || isWorking) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>↻ Syncing...</span>
        </span>
      );
    }
    if (status.state === 'offline') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <span>● Offline</span>
        </span>
      );
    }
    if (status.state === 'error') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30"
          title={status.errorMessage}
        >
          <span>⚠️ Error</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <span>● Synced</span>
      </span>
    );
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-[var(--card-bg)] border border-[var(--border-light)] rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-light)] bg-[var(--bg-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  E2EE Cloud Sync & QR Pairing
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  AES-GCM 256
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Zero-knowledge encrypted synchronization across Desktop & Mobile PWA
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {notice && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2.5 border ${
                notice.type === 'success'
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                  : 'bg-rose-950/60 text-rose-300 border-rose-800/60'
              }`}
            >
              {notice.type === 'success' ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{notice.message}</span>
            </div>
          )}

          {!isConfigured ? (
            <>
              {/* Zero-Knowledge Security Banner */}
              <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                    Zero-Knowledge Client-Side Encryption
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Your media library, episode checklists, book progress, custom lists, and Franchise
                    Canvases are encrypted in browser memory with <strong>AES-GCM (256-bit)</strong>{' '}
                    before leaving your device. Your secret key is embedded only in the URL{' '}
                    <code>#hash</code> and never touches any server logs.
                  </p>
                </div>
              </div>

              {viewStep === 'choices' ? (
                <div className="space-y-4">
                  {/* Create vs Join Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Create New Vault Card */}
                    <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--accent)]/60 transition-all flex flex-col justify-between gap-4">
                      <div className="space-y-2">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center">
                          <PlusCircle className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">
                          Create New Vault
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          Generate a fresh 256-bit encryption key, upload your encrypted library, and
                          display a QR code to pair your phone in 1 second.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isWorking}
                        onClick={handleCreateVault}
                        className="w-full py-2.5 px-4 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[var(--accent)]/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>{isWorking ? 'Encrypting & Creating...' : 'Create New Vault'}</span>
                      </button>
                    </div>

                    {/* Join Existing Vault Card */}
                    <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-emerald-500/50 transition-all flex flex-col justify-between gap-4">
                      <div className="space-y-2">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">
                          Join Existing Vault
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          Already created a vault on another device? Scan its QR code with your camera
                          or paste the pairing link / secret key.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isWorking}
                        onClick={() => {
                          setNotice(null);
                          setViewStep('join');
                        }}
                        className="w-full py-2.5 px-4 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Link2 className="w-4 h-4 text-emerald-400" />
                        <span>Pair Existing Vault</span>
                      </button>
                    </div>
                  </div>

                  {/* Advanced Cloud Locker & Passphrase Options */}
                  <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedProvider((prev) => !prev)}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Cloud Locker Provider & Optional Passphrase</span>
                      </span>
                      {showAdvancedProvider ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {showAdvancedProvider && (
                      <div className="p-4 pt-2 border-t border-[var(--border-light)] space-y-3 text-xs">
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'custom' as const, label: 'Cloudflare Worker' },
                            { id: 'relay' as const, label: 'Public REST Relay' },
                            { id: 'supabase' as const, label: 'Supabase Vault' }
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setProvider(opt.id)}
                              className={`py-2 px-2.5 rounded-lg border text-center font-semibold transition-all cursor-pointer ${
                                provider === opt.id
                                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-light)]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {provider === 'custom' && (
                          <div className="space-y-2">
                            <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                              Worker Endpoint URL
                            </label>
                            <input
                              type="text"
                              value={customEndpoint}
                              onChange={(e) => setCustomEndpoint(e.target.value)}
                              placeholder={DEFAULT_CLOUDFLARE_WORKER_URL}
                              className="w-full px-3 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] font-mono"
                            />
                            <input
                              type="password"
                              value={customAuthHeader}
                              onChange={(e) => setCustomAuthHeader(e.target.value)}
                              placeholder="Optional Bearer token / Authorization header"
                              className="w-full px-3 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] font-mono"
                            />
                          </div>
                        )}

                        {provider === 'supabase' && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={supabaseUrl}
                              onChange={(e) => setSupabaseUrl(e.target.value)}
                              placeholder="https://<project>.supabase.co"
                              className="w-full px-3 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] font-mono"
                            />
                            <input
                              type="password"
                              value={supabaseAnonKey}
                              onChange={(e) => setSupabaseAnonKey(e.target.value)}
                              placeholder="Supabase Anon Public Key"
                              className="w-full px-3 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] font-mono"
                            />
                          </div>
                        )}

                        <div className="space-y-1 pt-1">
                          <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                            Optional Passphrase (PBKDF2-SHA256, 100,000 iterations)
                          </label>
                          <input
                            type="password"
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            placeholder="Leave blank to generate a random 256-bit key"
                            className="w-full px-3 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Join Existing Vault View */
                <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-emerald-400" />
                      <span>Pair with Existing Vault</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        scannerRef.current?.stop();
                        scannerRef.current = null;
                        setIsScanning(false);
                        setViewStep('choices');
                      }}
                      className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] cursor-pointer"
                    >
                      ← Back
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                      Pairing URL or Vault Credentials (<code>#sync=v1:...</code> or{' '}
                      <code>vaultId:secretKey</code>)
                    </label>
                    <textarea
                      rows={2}
                      value={pairingInput}
                      onChange={(e) => setPairingInput(e.target.value)}
                      placeholder="https://scarlet-oyster-rs75.here.now/#sync=v1:..."
                      className="w-full px-3 py-2 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {isScanning && (
                    <div className="rounded-xl overflow-hidden border border-[var(--border-light)] bg-black p-2 space-y-1.5">
                      <video
                        ref={videoRef}
                        className="w-full max-h-56 rounded-lg object-cover bg-black"
                        playsInline
                        muted
                      />
                      <p className="text-[11px] text-center text-[var(--text-secondary)]">
                        Point your camera at the QR code displayed on your other device
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleStartCamera}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-[var(--accent)]" />
                      <span>{isScanning ? 'Stop Camera' : 'Scan QR Code'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => handleJoinWithInput()}
                      className="flex-[1.4] py-2.5 px-4 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[var(--accent)]/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Link2 className="w-4 h-4" />
                      <span>{isWorking ? 'Pairing & Decrypting...' : 'Join & Sync Vault'}</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Active Vault View */
            <div className="space-y-4">
              {/* Live Sync Status Card */}
              <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-bold text-[var(--text-primary)]">
                      Encrypted Vault Active
                    </span>
                    {renderStatusBadge()}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2 flex-wrap">
                    <span>
                      Synced{' '}
                      <strong className="text-[var(--text-primary)]">
                        {formatSyncRelativeTime(status.lastSyncedAt || config?.lastSyncedAt)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Locker:{' '}
                      <strong className="text-[var(--text-primary)]">
                        {config?.provider === 'supabase'
                          ? 'Supabase'
                          : config?.provider === 'relay'
                          ? 'Public REST Relay'
                          : 'Cloudflare Worker'}
                      </strong>
                    </span>
                  </div>
                  {status.state === 'error' && status.errorMessage && (
                    <p className="text-[11px] text-rose-400 mt-1">{status.errorMessage}</p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={status.state === 'syncing' || isWorking}
                  onClick={handleSyncNow}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold shadow-md shadow-[var(--accent)]/25 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      status.state === 'syncing' || isWorking ? 'animate-spin' : ''
                    }`}
                  />
                  <span>{status.state === 'syncing' || isWorking ? 'Syncing...' : 'Sync (Merge)'}</span>
                </button>
              </div>

              {/* Explicit Directional Sync Controls (Issue #54) */}
              <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Vault Directional Controls
                  </h4>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Push / Pull Overwrites
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Push to Cloud Button */}
                  <button
                    type="button"
                    disabled={status.state === 'syncing' || isWorking}
                    onClick={handlePushToCloud}
                    className="p-3.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 hover:border-sky-500/60 transition-all flex flex-col items-start gap-1.5 text-left cursor-pointer disabled:opacity-50 group"
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-sky-400 group-hover:text-sky-300">
                      <UploadCloud className="w-4 h-4 shrink-0" />
                      <span>Push to Cloud (Overwrite Vault)</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] group-hover:text-sky-200/80 leading-relaxed">
                      Uploads this device&apos;s current local library directly to the cloud vault, overwriting remote data.
                    </span>
                  </button>

                  {/* Pull from Cloud Button */}
                  <button
                    type="button"
                    disabled={status.state === 'syncing' || isWorking}
                    onClick={handlePullFromCloud}
                    className="p-3.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/60 transition-all flex flex-col items-start gap-1.5 text-left cursor-pointer disabled:opacity-50 group"
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-400 group-hover:text-amber-300">
                      <DownloadCloud className="w-4 h-4 shrink-0" />
                      <span>Pull from Cloud (Overwrite Local)</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)] group-hover:text-amber-200/80 leading-relaxed">
                      Downloads the cloud vault and replaces this device&apos;s local library with the cloud snapshot.
                    </span>
                  </button>
                </div>
              </div>

              {/* Collapsible QR Code & Device Pairing Section */}
              <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowQrPanel((prev) => !prev)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]/40 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-[var(--accent)]" />
                    <span>Pair Mobile PWA or Another Device (1-Second QR Scan)</span>
                  </span>
                  {showQrPanel ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                  )}
                </button>

                {showQrPanel && (
                  <div className="p-4 pt-2 border-t border-[var(--border-light)] space-y-4">
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Point your phone&apos;s camera at this QR code to open BingeLog Mobile PWA and
                      pair your encrypted vault immediately:
                    </p>

                    {qrSvg && (
                      <div className="flex justify-center">
                        <div
                          className="w-48 h-48 p-3 rounded-2xl bg-[#0f172a] border border-[var(--border-light)] shadow-inner"
                          dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                      </div>
                    )}

                    {/* Pairing Link Copy */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                        Zero-Knowledge Pairing Link (Secret key stays in <code>#hash</code> fragment):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={pairingUrl}
                          className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[11px] text-[var(--text-primary)] font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => copyToClipboard(pairingUrl, 'url')}
                          className="px-3 py-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-light)] text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          {copiedField === 'url' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Vault ID & Secret Key */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                          Vault ID
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            readOnly
                            value={config?.vaultId || ''}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[11px] text-[var(--text-primary)] font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(config?.vaultId || '', 'vault')}
                            className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] cursor-pointer"
                            title="Copy Vault ID"
                          >
                            {copiedField === 'vault' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                          <Key className="w-3 h-3 text-amber-400" />
                          <span>Secret Key (256-bit)</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type={revealSecretKey ? 'text' : 'password'}
                            readOnly
                            value={config?.secretKey || ''}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[11px] text-[var(--text-primary)] font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setRevealSecretKey((prev) => !prev)}
                            className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] cursor-pointer"
                            title={revealSecretKey ? 'Hide Secret Key' : 'Reveal Secret Key'}
                          >
                            {revealSecretKey ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(config?.secretKey || '', 'key')}
                            className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-light)] cursor-pointer"
                            title="Copy Secret Key"
                          >
                            {copiedField === 'key' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Disconnect Vault Option */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">Disconnect Vault</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Stop cloud syncing on this device. Your local IndexedDB library remains untouched.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
