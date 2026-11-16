# Polish: Position Mobile Pinned Cards Section Above "Now In Progress" (Issue #58)

## 📌 Summary
On mobile PWA screens, user-pinned media cards currently render below the "Now In Progress" horizontal carousel. Pinned items represent titles the user has intentionally marked for highest priority and immediate access. Having "Now In Progress" appear above "Pinned" forces users to scroll past active watching carousels before seeing their explicitly pinned cards.

The Pinned cards section must be positioned directly above "Now In Progress" on mobile, matching user mental models where pinned content holds topmost priority.

---

## 🔍 Root Cause Analysis
1. In `src/App.tsx`, within the mobile view rendering container (`div.md:hidden`):
   - `MobileSearchStrip` is rendered first.
   - `MobileFilterChips` is rendered second.
   - `NowInProgressCarousel` was rendered third.
2. The `Pinned Cards Section` was rendered outside `div.md:hidden`, lower in the document tree (below `FilterBar` and `NowInProgressCarousel`).
3. Consequently, on mobile devices, pinned items appeared below the "Now In Progress" carousel.

---

## 🛠️ Implementation Plan
1. **Reorder Layout Hierarchy in `src/App.tsx`:**
   - Position `Pinned Cards Section` immediately following `MobileFilterChips` on mobile and `FilterBar` on desktop.
   - Position `NowInProgressCarousel` below the `Pinned Cards Section`.
   - Ensure desktop layout remains unaffected (`FilterBar` -> `Pinned Cards Section` -> `Media Grid/List`).
2. **Automated Verification:**
   - Add automated test verifying DOM order of Pinned section relative to "Now In Progress" carousel on mobile.

---

## ✅ Acceptance Criteria
- [x] On mobile screens, the Pinned Cards section appears directly above the "Now In Progress" carousel.
- [x] On desktop screens, the Pinned Cards section remains positioned below the filter bar and above the media collection.
- [x] Expanding and collapsing pinned cards functions smoothly on both desktop and mobile.
