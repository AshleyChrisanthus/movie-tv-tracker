# Bug: Books in "Now In Progress" Carousel Display "Watching" Tag (Issue #59)

## 📌 Summary
In the mobile PWA's "Now In Progress" carousel (`NowInProgressCarousel.tsx`), active items display an overlay status badge on their landscape artwork card. While TV shows and movies display countdowns or a glowing `Watching` pill, books currently display the `Watching` tag as well when in progress.

For books, this badge must display `Reading` (or `Listening` for audiobooks) instead of `Watching`.

---

## 🔍 Root Cause Analysis
In `src/components/mobile/NowInProgressCarousel.tsx` (lines 208-213):
```tsx
) : (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/80 backdrop-blur-md text-white text-[10px] font-bold tracking-wide shadow-sm">
    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
    <span>Watching</span>
  </span>
)}
```
The status pill hardcoded `<span>Watching</span>` for any in-progress item that did not have an un-aired countdown. Even though `isBook` and `isAudio` were correctly computed earlier in the component for the header badge and subtitle, the in-progress status pill failed to account for media type.

---

## 🛠️ Implementation Plan
1. **Dynamic Semantic Tag Label in `NowInProgressCarousel.tsx`:**
   - Compute `inProgressTagLabel = isAudio ? 'Listening' : isBook ? 'Reading' : 'Watching'`.
   - Render `{inProgressTagLabel}` in place of the hardcoded `Watching` string.
2. **Automated Testing:**
   - Add unit test verifying that books in progress render the `Reading` tag and audiobooks render `Listening`.

---

## ✅ Acceptance Criteria
- [x] In-progress books in the "Now In Progress" carousel display `Reading` with the amber pulsating badge.
- [x] In-progress audiobooks display `Listening`.
- [x] In-progress TV shows and movies continue to display `Watching` (or live countdowns for future episodes).
- [x] All automated tests pass.
