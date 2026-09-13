import React, { useState, useEffect } from 'react';
import {
  Palette,
  X,
  RotateCcw,
  Check,
  Sparkles,
  Copy,
  Upload,
  Sun,
  Moon
} from 'lucide-react';
import {
  THEME_PRESETS,
  getActivePreset,
  applyPresetPaletteForMode,
  applyCustomThemeProperties,
  clearCustomThemeProperties,
  THEME_KEY,
  ACTIVE_PRESET_KEY,
  CUSTOM_THEME_KEY,
  GENRE_COLORS_KEY,
  getGenreColors,
  setGenreColor,
  getGenreTagStyle,
  hslToHex,
  rgbToHex
} from '../styles/theme';
import type { MediaItem, ThemeMode, ThemePreset, GenreColors } from '../types';

export interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaList?: MediaItem[];
  onThemeChanged?: () => void;
}

interface ColorPickerItemProps {
  label: string;
  property: string;
  value?: string;
  onChange: (property: string, value: string) => void;
}

type ThemeTab = 'palettes' | 'granular' | 'tagColors' | 'export';

export default function ThemeModal({
  isOpen,
  onClose,
  mediaList = [],
  onThemeChanged
}: ThemeModalProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<ThemeTab>('palettes');
  const [activePresetId, setActivePresetId] = useState<string>('default');
  const [currentMode, setCurrentMode] = useState<ThemeMode>('dark');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [importJsonText, setImportJsonText] = useState<string>('');

  // Granular color state
  const [granularColors, setGranularColors] = useState<Record<string, string>>({
    '--accent': '#0a84ff',
    '--accent-hover': '#409cff',
    '--bg-primary': '#0d0d0f',
    '--card-bg': '#1c1c1e',
    '--bg-secondary': '#1c1c1e',
    '--bg-hover': '#3a3a3c',
    '--text-primary': '#f5f5f7',
    '--text-secondary': '#a1a1a6',
    '--border-light': '#2c2c2e',
    '--tag-text': '#0a84ff',
    '--tag-bg': 'rgba(10,132,255,0.12)'
  });

  // Genre colors state
  const [genreColors, setGenreColorsState] = useState<GenreColors>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2600);
  };

  // Sync state when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const mode = (document.documentElement.getAttribute('data-theme') || 'dark') as ThemeMode;
    setCurrentMode(mode);

    const active = getActivePreset();
    setActivePresetId(active.id);

    // Read current computed CSS properties from documentElement
    const computed = getComputedStyle(document.documentElement);
    const newColors: Record<string, string> = {};
    const props = [
      '--accent', '--accent-hover', '--bg-primary', '--card-bg',
      '--bg-secondary', '--bg-hover', '--text-primary', '--text-secondary',
      '--border-light', '--tag-text', '--tag-bg'
    ];

    props.forEach(p => {
      const val = computed.getPropertyValue(p).trim();
      if (val) {
        if (val.startsWith('rgb')) {
          const parts = val.match(/\d+/g);
          if (parts && parts.length >= 3) {
            newColors[p] = rgbToHex(Number(parts[0]), Number(parts[1]), Number(parts[2]));
            return;
          }
        }
        newColors[p] = val;
      }
    });

    setGranularColors(prev => ({ ...prev, ...newColors }));
    setGenreColorsState(getGenreColors());
  }, [isOpen]);

  if (!isOpen) return null;

  // Extract all unique genres from media library
  const allGenres: string[] = Array.from(
    new Set(
      mediaList.flatMap(m => Array.isArray(m.genres) ? m.genres : [])
    )
  ).sort((a, b) => a.localeCompare(b));

  // Switch preset
  const handleSelectPreset = (preset: ThemePreset) => {
    localStorage.setItem(ACTIVE_PRESET_KEY, preset.id);
    setActivePresetId(preset.id);
    applyPresetPaletteForMode(currentMode);

    // Refresh granular pickers
    const computed = getComputedStyle(document.documentElement);
    const updated: Record<string, string> = {};
    Object.keys(granularColors).forEach(prop => {
      const val = computed.getPropertyValue(prop).trim();
      if (val) updated[prop] = val;
    });
    setGranularColors(prev => ({ ...prev, ...updated }));

    if (onThemeChanged) onThemeChanged();
    showToast(`Applied "${preset.name}" theme preset!`);
  };

  // Update granular color in real-time
  const handleGranularChange = (property: string, value: string) => {
    setGranularColors(prev => ({ ...prev, [property]: value }));
    applyCustomThemeProperties({ [property]: value });

    // Persist to custom colors
    try {
      const raw = localStorage.getItem(CUSTOM_THEME_KEY);
      const parsed = raw ? JSON.parse(raw) as Record<string, Record<string, string>> : {};
      parsed[currentMode] = { ...(parsed[currentMode] || {}), [property]: value };
      localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(parsed));
    } catch {
      // Ignore JSON parse errors
    }

    if (onThemeChanged) onThemeChanged();
  };

  // Genre color change
  const handleGenreChange = (genre: string, color: string | null) => {
    const updated = setGenreColor(genre, color);
    setGenreColorsState({ ...updated });
    if (onThemeChanged) onThemeChanged();
  };

  // Auto-colorize genres evenly across color wheel
  const handleAutoColorizeGenres = () => {
    if (allGenres.length === 0) {
      showToast('No genres in your library yet.');
      return;
    }
    const isDark = currentMode !== 'light';
    const lightness = isDark ? 65 : 45;
    const saturation = isDark ? 80 : 70;
    const step = 360 / allGenres.length;

    const newColors: Record<string, string> = {};
    allGenres.forEach((g, idx) => {
      const hue = Math.round((idx * step + 200) % 360);
      newColors[g.toLowerCase()] = hslToHex(hue, saturation, lightness);
    });

    localStorage.setItem(GENRE_COLORS_KEY, JSON.stringify(newColors));
    setGenreColorsState(newColors);
    if (onThemeChanged) onThemeChanged();
    showToast(`Auto-colorized ${allGenres.length} genres harmoniously!`);
  };

  const handleResetGenres = () => {
    localStorage.removeItem(GENRE_COLORS_KEY);
    setGenreColorsState({});
    if (onThemeChanged) onThemeChanged();
    showToast('Genre tag colors reset to default.');
  };

  // Reset all theme customizations
  const handleResetAll = () => {
    localStorage.removeItem(ACTIVE_PRESET_KEY);
    localStorage.removeItem(CUSTOM_THEME_KEY);
    localStorage.removeItem(GENRE_COLORS_KEY);
    clearCustomThemeProperties();
    applyPresetPaletteForMode(currentMode);
    setActivePresetId('default');
    setGenreColorsState({});

    const computed = getComputedStyle(document.documentElement);
    const resetCols: Record<string, string> = {};
    Object.keys(granularColors).forEach(prop => {
      const val = computed.getPropertyValue(prop).trim();
      if (val) resetCols[prop] = val;
    });
    setGranularColors(resetCols);

    if (onThemeChanged) onThemeChanged();
    showToast('Theme and colors reset to default.');
  };

  // Export theme JSON
  const handleExportTheme = () => {
    const config = {
      theme: currentMode,
      activePreset: activePresetId,
      customColors: localStorage.getItem(CUSTOM_THEME_KEY) ? JSON.parse(localStorage.getItem(CUSTOM_THEME_KEY)!) : {},
      genreColors: getGenreColors()
    };
    navigator.clipboard.writeText(JSON.stringify(config, null, 2))
      .then(() => showToast('Theme configuration copied to clipboard!'))
      .catch(() => showToast('Failed to copy theme to clipboard.'));
  };

  // Import theme JSON
  const handleImportTheme = () => {
    if (!importJsonText.trim()) {
      showToast('Please paste a valid theme JSON.');
      return;
    }
    try {
      const config = JSON.parse(importJsonText.trim()) as {
        theme?: ThemeMode;
        activePreset?: string;
        customColors?: Record<string, Record<string, string>>;
        genreColors?: GenreColors;
      };
      if (config.theme && (config.theme === 'dark' || config.theme === 'light')) {
        document.documentElement.setAttribute('data-theme', config.theme);
        localStorage.setItem(THEME_KEY, config.theme);
        setCurrentMode(config.theme);
      }
      if (config.activePreset) {
        localStorage.setItem(ACTIVE_PRESET_KEY, config.activePreset);
        setActivePresetId(config.activePreset);
      }
      if (config.customColors) {
        localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(config.customColors));
      }
      if (config.genreColors) {
        localStorage.setItem(GENRE_COLORS_KEY, JSON.stringify(config.genreColors));
        setGenreColorsState(config.genreColors);
      }
      applyPresetPaletteForMode(config.theme || currentMode);
      if (config.customColors && config.customColors[config.theme || currentMode]) {
        applyCustomThemeProperties(config.customColors[config.theme || currentMode]);
      }
      if (onThemeChanged) onThemeChanged();
      setImportJsonText('');
      showToast('Theme imported successfully!');
    } catch {
      showToast('Invalid JSON format.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Toast alert banner inside modal */}
        {toastMessage && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-[var(--accent)] text-white text-xs font-semibold shadow-lg animate-in slide-in-from-top-2">
            {toastMessage}
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent-bg)] text-[var(--accent)]">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Customize Theme & Colors</h2>
              <p className="text-xs text-[var(--text-secondary)]">Handcrafted presets, custom colors & genre tag styling</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Navigation */}
        <div className="flex items-center gap-1.5 px-6 py-2.5 bg-[var(--bg-primary)] border-b border-[var(--border-light)] overflow-x-auto scrollbar-none text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('palettes')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'palettes'
                ? 'bg-[var(--accent)] text-white font-semibold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            🎨 Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('granular')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'granular'
                ? 'bg-[var(--accent)] text-white font-semibold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            🎛️ UI Colors
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tagColors')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'tagColors'
                ? 'bg-[var(--accent)] text-white font-semibold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            🏷️ Genre Tags
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'export'
                ? 'bg-[var(--accent)] text-white font-semibold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            💾 Import / Export
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: PRESETS */}
          {activeTab === 'palettes' && (
            <div>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Select a handcrafted theme family. Each preset automatically tunes dark and light modes.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {THEME_PRESETS.map(preset => {
                  const isActive = preset.id === activePresetId;
                  const swatches = (preset.swatches && preset.swatches[currentMode]) || (preset.swatches && preset.swatches.dark) || [];

                  return (
                    <div
                      key={preset.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectPreset(preset)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectPreset(preset);
                        }
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                        isActive
                          ? 'border-[var(--accent)] bg-[var(--accent-bg)] shadow-md ring-1 ring-[var(--accent)]'
                          : 'border-[var(--border-light)] bg-[var(--card-bg)] hover:border-[var(--accent)] hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="flex h-2.5 rounded-full overflow-hidden mb-2.5 border border-black/10">
                        {swatches.map((color, idx) => (
                          <div key={idx} className="flex-1 h-full" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{preset.name}</span>
                        {isActive && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">{preset.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: GRANULAR UI COLORS */}
          {activeTab === 'granular' && (
            <div className="space-y-5">
              <p className="text-xs text-[var(--text-secondary)]">
                Fine-tune individual design tokens with instant real-time live preview.
              </p>

              {/* Brand & Accent Group */}
              <div>
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2.5">
                  Brand & Accent
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ColorPickerItem
                    label="Primary Accent"
                    property="--accent"
                    value={granularColors['--accent']}
                    onChange={handleGranularChange}
                  />
                  <ColorPickerItem
                    label="Accent Hover"
                    property="--accent-hover"
                    value={granularColors['--accent-hover']}
                    onChange={handleGranularChange}
                  />
                </div>
              </div>

              {/* Backgrounds & Surfaces */}
              <div>
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2.5">
                  Backgrounds & Surfaces
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ColorPickerItem
                    label="Page Background"
                    property="--bg-primary"
                    value={granularColors['--bg-primary']}
                    onChange={handleGranularChange}
                  />
                  <ColorPickerItem
                    label="Card / Surface"
                    property="--card-bg"
                    value={granularColors['--card-bg']}
                    onChange={handleGranularChange}
                  />
                  <ColorPickerItem
                    label="Nav / Header Bar"
                    property="--bg-secondary"
                    value={granularColors['--bg-secondary']}
                    onChange={handleGranularChange}
                  />
                  <ColorPickerItem
                    label="Hover Highlight"
                    property="--bg-hover"
                    value={granularColors['--bg-hover']}
                    onChange={handleGranularChange}
                  />
                </div>
              </div>

              {/* Text & Borders */}
              <div>
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-2.5">
                  Text & Borders
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ColorPickerItem
                    label="Primary Text"
                    property="--text-primary"
                    value={granularColors['--text-primary']}
                    onChange={handleGranularChange}
                  />
                  <ColorPickerItem
                    label="Secondary Text"
                    property="--text-secondary"
                    value={granularColors['--text-secondary']}
                    onChange={handleGranularChange}
                  />
                  <ColorPickerItem
                    label="Borders & Outlines"
                    property="--border-light"
                    value={granularColors['--border-light']}
                    onChange={handleGranularChange}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GENRE TAG COLORS */}
          {activeTab === 'tagColors' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--text-secondary)]">
                  Assign colors to genres for instant visual differentiation across your library.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoColorizeGenres}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--accent-bg)] text-[var(--accent)] hover:brightness-110 border border-[var(--accent)]/30 transition-all shadow-sm"
                    title="Auto-distribute harmonious colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Colorize</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetGenres}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-light)] transition-all"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {allGenres.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)]">
                  No genres found in your library yet. Add some movies or TV shows to customize genre tag colors!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {allGenres.map(genre => {
                    const key = genre.toLowerCase();
                    const currentColor = genreColors[key] || '#0a84ff';
                    const hasCustom = !!genreColors[key];
                    const tagStyle = getGenreTagStyle(genre);

                    return (
                      <div
                        key={genre}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border-light)] bg-[var(--card-bg)] text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-[var(--text-primary)] truncate">{genre}</span>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0"
                            style={tagStyle}
                          >
                            Preview
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentColor.startsWith('#') ? currentColor : '#0a84ff'}
                            onChange={(e) => handleGenreChange(genre, e.target.value)}
                            className="w-7 h-7 rounded-lg border border-[var(--border-light)] bg-transparent cursor-pointer"
                          />
                          {hasCustom && (
                            <button
                              type="button"
                              onClick={() => handleGenreChange(genre, null)}
                              className="text-[var(--text-secondary)] hover:text-[var(--danger)] p-1 rounded-md"
                              title="Reset this genre"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: IMPORT / EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-[var(--border-light)] bg-[var(--card-bg)]">
                <h4 className="font-bold text-[var(--text-primary)] mb-1">Export Current Theme</h4>
                <p className="text-[var(--text-secondary)] mb-3">Copy your entire theme configuration JSON to clipboard.</p>
                <button
                  type="button"
                  onClick={handleExportTheme}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-semibold hover:brightness-110 shadow-sm"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Theme JSON</span>
                </button>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-light)] bg-[var(--card-bg)]">
                <h4 className="font-bold text-[var(--text-primary)] mb-1">Import Custom Theme</h4>
                <p className="text-[var(--text-secondary)] mb-2">Paste a theme JSON configuration below to apply it:</p>
                <textarea
                  rows={4}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder='{"theme": "dark", "activePreset": "midnight-sapphire", ...}'
                  className="w-full p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-light)] text-[var(--text-primary)] font-mono text-[11px] focus:outline-none focus:border-[var(--accent)] mb-3"
                />
                <button
                  type="button"
                  onClick={handleImportTheme}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] text-[var(--text-primary)] font-semibold border border-[var(--border-light)] hover:bg-[var(--border-light)]"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Apply Theme JSON</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border-light)] bg-[var(--bg-primary)]">
          <button
            type="button"
            onClick={handleResetAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All to Default</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[var(--accent)]/20 active:scale-95"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}

function ColorPickerItem({ label, property, value = '#0a84ff', onChange }: ColorPickerItemProps): React.JSX.Element {
  const hexVal = value.startsWith('#') ? value : '#0a84ff';

  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border-light)] bg-[var(--card-bg)] text-xs">
      <span className="text-[var(--text-secondary)] font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hexVal}
          onChange={(e) => onChange(property, e.target.value)}
          className="w-6 h-6 rounded-lg border border-[var(--border-light)] bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(property, e.target.value)}
          className="w-20 px-2 py-0.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border-light)] font-mono text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
    </div>
  );
}
