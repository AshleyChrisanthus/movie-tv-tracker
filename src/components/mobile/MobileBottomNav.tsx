import React, { useState, useEffect, useRef } from 'react';
import { Film, Network, Plus, Calendar, Settings } from 'lucide-react';

export interface MobileBottomNavProps {
  currentTab: 'library' | 'canvas' | 'upcoming';
  onSelectTab: (tab: 'library' | 'canvas' | 'upcoming') => void;
  onOpenSearch: () => void;
  onOpenManual?: () => void;
  isUpcomingActive?: boolean;
  onToggleUpcoming?: () => void;
  upcomingCount?: number;
  onOpenSettings: () => void;
}

export default function MobileBottomNav({
  currentTab,
  onSelectTab,
  onOpenSearch,
  isUpcomingActive = false,
  onToggleUpcoming,
  upcomingCount = 0,
  onOpenSettings
}: MobileBottomNavProps): React.JSX.Element {
  const isUpcomingTabActive = currentTab === 'upcoming' || isUpcomingActive;
  const isLibraryActive = currentTab === 'library' && !isUpcomingTabActive;
  const isCanvasActive = currentTab === 'canvas';

  // Scroll-aware auto-hiding (Issue #52 & App-Directory #70)
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
          const deltaY = currentScrollY - lastScrollY.current;
          const windowHeight = window.innerHeight;
          const docHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight
          );

          // Hide Condition: Scrolling down with deltaY > 10px once scrollY > 60px
          if (deltaY > 10 && currentScrollY > 60) {
            setIsHidden(true);
          }
          // Reveal Condition: Scrolling up (deltaY < -8px), reaching the top (scrollY <= 40px), or reaching the bottom of the page
          else if (
            deltaY < -8 ||
            currentScrollY <= 40 ||
            windowHeight + currentScrollY >= docHeight - 20
          ) {
            setIsHidden(false);
          }

          lastScrollY.current = Math.max(0, currentScrollY);
          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  // When tabs change or upcoming view toggles, ensure nav is revealed
  useEffect(() => {
    setIsHidden(false);
  }, [currentTab, isUpcomingActive]);

  return (
    <nav
      className={`fixed bottom-0 inset-x-0 z-40 md:hidden bg-[#0d0d0f]/90 dark:bg-[#0d0d0f]/90 bg-opacity-90 backdrop-blur-2xl border-t border-[var(--border-light)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 select-none transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
        isHidden ? 'nav-hidden translate-y-[120%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
      }`}
      style={{
        transition: 'transform 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms cubic-bezier(0.22, 1, 0.36, 1)'
      }}
      aria-label="Mobile Navigation"
    >
      <div className="max-w-md mx-auto px-4 flex items-center justify-between relative">
        {/* 1. Library Item */}
        <button
          type="button"
          onClick={() => {
            onSelectTab('library');
            if (isUpcomingActive && onToggleUpcoming) {
              onToggleUpcoming();
            }
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 cursor-pointer ${
            isLibraryActive
              ? 'text-[var(--accent)] font-bold'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Film className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Library</span>
        </button>

        {/* 2. Graph / Canvas Item */}
        <button
          type="button"
          onClick={() => onSelectTab('canvas')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 cursor-pointer ${
            isCanvasActive
              ? 'text-[var(--accent)] font-bold'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Network className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Graph</span>
        </button>

        {/* 3. Center Glowing + FAB (Elevated) */}
        <div className="flex-1 flex justify-center -translate-y-4">
          <button
            type="button"
            onClick={onOpenSearch}
            className="w-[52px] h-[52px] rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-lg shadow-[var(--accent)]/50 border-4 border-[var(--bg-primary)] active:scale-90 hover:brightness-110 transition-all cursor-pointer ring-2 ring-[var(--accent)]/20"
            title="Search and Add Media"
            aria-label="Add Media"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* 4. Upcoming Releases Item */}
        <button
          type="button"
          onClick={() => {
            onSelectTab('upcoming');
            if (!isUpcomingActive && onToggleUpcoming) {
              onToggleUpcoming();
            }
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-1 relative transition-all active:scale-95 cursor-pointer ${
            isUpcomingTabActive
              ? 'text-[var(--accent)] font-bold'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <div className="relative">
            <Calendar className="w-5 h-5" />
            {upcomingCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-[var(--accent)] ring-2 ring-[#0d0d0f]" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Upcoming</span>
        </button>

        {/* 5. Settings Item */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all active:scale-95 cursor-pointer"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Settings</span>
        </button>
      </div>
    </nav>
  );
}
