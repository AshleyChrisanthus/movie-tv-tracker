// Camera QR Code Scanner with BarcodeDetector and canvas fallback

export interface ScannerCallbacks {
  onDetected: (scannedText: string) => void;
  onError: (errorMsg: string) => void;
}

export class QrCameraScanner {
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private isScanning = false;
  private animFrameId: number | null = null;
  private detector: { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } | null = null;

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof (globalThis as Record<string, unknown>).BarcodeDetector !== 'undefined'
    );
  }

  async start(videoElement: HTMLVideoElement, callbacks: ScannerCallbacks): Promise<boolean> {
    this.stop();
    this.videoEl = videoElement;

    const BarcodeDetectorCtor = (globalThis as Record<string, unknown>).BarcodeDetector as
      | (new (opts: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
        })
      | undefined;

    if (BarcodeDetectorCtor) {
      try {
        this.detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      } catch {
        this.detector = null;
      }
    }

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        this.canvasEl = document.createElement('canvas');
      } catch {
        this.canvasEl = null;
      }
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();
      this.isScanning = true;

      this.scanLoop(callbacks);
      return true;
    } catch (err: unknown) {
      this.stop();
      const errObj = err as { name?: string; message?: string };
      callbacks.onError(
        errObj?.name === 'NotAllowedError'
          ? 'Camera access denied'
          : errObj?.message || 'Could not open camera'
      );
      return false;
    }
  }

  private scanLoop(callbacks: ScannerCallbacks): void {
    if (!this.isScanning || !this.videoEl || !this.detector) return;

    const HAVE_CURRENT_DATA = 2;
    if (this.videoEl.readyState >= HAVE_CURRENT_DATA) {
      let source: ImageBitmapSource = this.videoEl;
      if (
        this.canvasEl &&
        typeof this.canvasEl.getContext === 'function' &&
        this.videoEl.videoWidth > 0 &&
        this.videoEl.videoHeight > 0
      ) {
        const ctx = this.canvasEl.getContext('2d');
        if (ctx) {
          this.canvasEl.width = this.videoEl.videoWidth;
          this.canvasEl.height = this.videoEl.videoHeight;
          ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
          source = this.canvasEl;
        }
      }

      this.detector
        .detect(source)
        .then((barcodes) => {
          if (!this.isScanning) return;
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            if (rawValue) {
              this.stop();
              callbacks.onDetected(rawValue);
              return;
            }
          }
          if (typeof requestAnimationFrame === 'function') {
            this.animFrameId = requestAnimationFrame(() => this.scanLoop(callbacks));
          }
        })
        .catch(() => {
          if (this.isScanning && typeof requestAnimationFrame === 'function') {
            this.animFrameId = requestAnimationFrame(() => this.scanLoop(callbacks));
          }
        });
    } else if (typeof requestAnimationFrame === 'function') {
      this.animFrameId = requestAnimationFrame(() => this.scanLoop(callbacks));
    }
  }

  stop(): void {
    this.isScanning = false;
    if (this.animFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
  }
}
