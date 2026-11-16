# Feature: Mobile Upcoming As Dedicated Navigation Tab (Issue #57)

## 📌 Summary
In the mobile PWA experience, viewing upcoming releases was previously treated as an awkward sub-view toggle (`isMobileUpcomingView`) or required applying an upcoming window filter in the mobile filter sheet. Tapping "Upcoming" in the bottom navigation bar toggled a state inside the Library view, which conditionally hid media items and header sections via CSS classes rather than behaving as a primary first-class tab. Furthermore, having an "Upcoming Window" filter inside `MobileFilterSheet.tsx` confused users into filtering their existing library collection rather than browsing a dedicated upcoming release schedule.

Upcoming must be promoted to a dedicated, first-class tab in the mobile navigation system (`'library' | 'upcoming' | 'canvas'`), providing a persistent, predictable view that does not toggle off or require applying library filters.

---

## 🔍 Root Cause Analysis
1. **Navigation State Asymmetry:**
   `mainTab` in `src/App.tsx` and `src/components/mobile/MobileBottomNav.tsx` only supported `'library' | 'canvas'`. The Upcoming view was managed via an auxiliary boolean flag `isMobileUpcomingView`, causing the bottom bar to treat the Upcoming icon as a toggle (`prev => !prev`) rather than a tab switch.
2. **Library View Interleaving & CSS Hiding:**
   `MobileUpcomingView` was rendered inside the main Library container, using `hidden md:block` utilities to suppress the pinned cards section and collection grid.
3. **Redundant Upcoming Filter in Mobile Filter Sheet:**
   `MobileFilterSheet.tsx` presented an "Upcoming Window" filter (`7 Days`, `14 Days`, `30 Days`, `All`) that filtered the primary library collection instead of navigating to the dedicated schedule view, causing user confusion.

---

## 🛠️ Implementation Plan
1. **Promote Upcoming to First-Class Tab in Bottom Navigation (`MobileBottomNav.tsx`):**
   - Extend `currentTab` and `onSelectTab` to accept `'library' | 'upcoming' | 'canvas'`.
   - Update the Upcoming navigation item so tapping it calls `onSelectTab('upcoming')` directly, highlighting the tab as active when `currentTab === 'upcoming'`.
   - Maintain backward compatibility for `isUpcomingActive` and `onToggleUpcoming` if provided.
2. **Tab Routing in `src/App.tsx`:**
   - Update `mainTab` type to `'library' | 'upcoming' | 'canvas'`.
   - When `mainTab === 'upcoming'`, render `MobileUpcomingView` directly as the active view.
   - Synchronize `isMobileUpcomingView` with `mainTab === 'upcoming'` for full backward compatibility with existing tests.
3. **Mobile Filter Sheet Streamlining (`MobileFilterSheet.tsx`):**
   - Provide a direct quick-action to switch to the dedicated Upcoming tab rather than applying destructive filters to the library collection.
4. **Automated Testing:**
   - Verify tab navigation to `'upcoming'`, active highlighting, and view rendering.

---

## ✅ Acceptance Criteria
- [x] Upcoming is a dedicated first-class tab in `MobileBottomNav` alongside Library and Graph.
- [x] Tapping `Upcoming` switches directly to the Upcoming schedule view; tapping it repeatedly stays on Upcoming rather than toggling away.
- [x] Tapping `Library` or `Graph` switches cleanly between their respective views.
- [x] Upcoming releases are accessed directly via the tab rather than needing an upcoming filter in the library filter sheet.
- [x] Existing test suites and new mobile tab tests pass.
