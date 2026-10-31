# Feature: Live Episode Countdown & Visibility/Focus Ticker (Issue #55)

## 📌 Summary
When users keep BingeLog open in a desktop browser tab or run it as an installed Progressive Web App (PWA) on mobile or desktop, the countdown timers (e.g. `S2E3 drops in 3h`, `Next ep drops in 45m`) remain static. If the tab or app is left open, or minimized/backgrounded and returned to hours later, the timers show stale values until a hard reload or manual data mutation occurs.

Similar to how BingeLog's Cloud Sync automatically performs a synchronization check when switching to the tab (`visibilitychange`), countdown timers and upcoming indicators should update dynamically:
1. **Instantly on Tab Switch / App Resume:** Recalculate countdowns as soon as the browser tab or PWA comes back into focus (`visibilitychange`, `window.onfocus`, `pageshow`).
2. **Foreground Live Ticker:** When visible, tick periodically on a lightweight 1-minute interval (`setInterval`), immediately updating any minute/hour/day transition without requiring page reload.
3. **Zero Resource Overhead:** Pauses ticking completely when the tab is hidden (`document.hidden`), guaranteeing 0% CPU consumption and zero battery drain while the user is away or the device is sleeping.

---

## 🔍 Root Cause Analysis
1. **Render-time Snapshot Evaluation:**
   `getEpisodeCountdown()` in `src/utils/timezone.ts` calculates diffs via `dropTimestamp - Date.now()`. However, React components (`MediaCard`, `MediaListView`, `MediaDetailModal`, `MobileMediaDetailSheet`, `MobileUpcomingView`) only invoke this during render without any ongoing state or timer trigger.
2. **Missing Visibility / Focus Listeners for Timers:**
   While `SyncManager` listens for `document.addEventListener('visibilitychange', ...)`, there was no UI-level hook or listener to signal React components to re-evaluate `Date.now()`.
3. **Hard-Frozen Memoization in Upcoming Views:**
   `MobileUpcomingView.tsx` specifically froze `now` permanently upon mount: `const now = useMemo(() => new Date(), []);`.
4. **App-Level Badge Stagnation:**
   `App.tsx` memoized `upcomingCount` solely against `[mediaList, upcomingDays]`. As real-world time passed, titles that dropped into or out of the upcoming window did not update the badge without an external state change.

---

## 🛠️ Implementation Plan
1. **Shared Live Ticker Hook (`src/hooks/useLiveTicker.ts`):**
   - Singleton subscriber architecture: single interval managed globally across the entire app.
   - Listens to `visibilitychange`, `window.focus`, and `window.pageshow`.
   - Pauses execution when `document.hidden` is true (zero background CPU usage).
   - Exposes `useLiveTicker()` returning the latest timestamp, updating every 60s when visible and immediately upon tab switch.
2. **Timezone Utility Enhancement (`src/utils/timezone.ts`):**
   - Allow passing optional `nowTime: number | Date = Date.now()` into `getEpisodeCountdown` and `isEpisodeAired` while preserving full backward compatibility.
3. **Component Integration:**
   - **`src/App.tsx`**: Consume `useLiveTicker()` to invalidate `upcomingCount` and upcoming filtering. Passing the tick down or triggering top-level re-render automatically updates all `MediaCard` and `MediaListView` countdowns.
   - **`src/components/mobile/MobileUpcomingView.tsx`**: Unfreeze `now` using `useLiveTicker()`.
   - **`src/components/MediaDetailModal.tsx` & `src/components/mobile/MobileMediaDetailSheet.tsx`**: Consume `useLiveTicker()` so open detail sheets stay live and refresh instantly on focus.
4. **Unit & Integration Testing:**
   - Add automated test suite in `tests/tier1-features/live-countdown-ticker.test.js` verifying:
     - Accurate countdown recalculation across simulated time steps.
     - Focus & visibilitychange event simulation triggering immediate recalculation.
     - `getEpisodeCountdown` with custom current time parameter.
     - Background pause behavior verification.
