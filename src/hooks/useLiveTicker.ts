import { useState, useEffect } from 'react';

type TickListener = (now: number) => void;

const listeners = new Set<TickListener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let isListenersInitialized = false;

/**
 * Notify all registered ticker subscribers with the current timestamp.
 */
export function triggerLiveTick(customNow?: number): void {
  const now = customNow ?? Date.now();
  listeners.forEach(listener => {
    try {
      listener(now);
    } catch (e) {
      console.error('Error in live ticker subscriber:', e);
    }
  });
}

/**
 * Starts the shared 1-minute ticker if not already running.
 * Automatically skips ticks when tab or PWA is in the background.
 */
function startTicker(): void {
  if (intervalId !== null || typeof window === 'undefined') return;

  intervalId = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) {
      return; // 0 CPU consumption while tab or app is backgrounded
    }
    triggerLiveTick();
  }, 60000);
}

/**
 * Stops the shared interval when all subscribers have unmounted.
 */
function stopTicker(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Initialize event listeners for tab focus, visibilitychange, and PWA resume.
 */
function initVisibilityListeners(): void {
  if (isListenersInitialized || typeof window === 'undefined') return;
  isListenersInitialized = true;

  const handleWake = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }
    // Instant recalculation the moment the user returns to the tab or wakes the PWA
    triggerLiveTick();
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleWake);
  }

  window.addEventListener('focus', handleWake);
  window.addEventListener('pageshow', handleWake);
}

/**
 * React hook that returns the live timestamp (ms), automatically updating:
 * 1. Instantly whenever the browser tab or PWA window gains focus / becomes visible.
 * 2. Every 60 seconds while the app remains in view.
 *
 * Resource consumption:
 * - 0% CPU and 0 battery when hidden in background.
 * - Single shared interval across the entire application.
 */
export function useLiveTicker(): number {
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  useEffect(() => {
    initVisibilityListeners();

    const onTick: TickListener = (now) => {
      setCurrentTime(now);
    };

    listeners.add(onTick);

    if (listeners.size === 1) {
      startTicker();
    }

    return () => {
      listeners.delete(onTick);
      if (listeners.size === 0) {
        stopTicker();
      }
    };
  }, []);

  return currentTime;
}
