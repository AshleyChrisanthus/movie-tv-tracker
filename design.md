# Design System: Apple-Inspired Glassmorphic Theme

This document defines the visual design language, design tokens, color presets, and glassmorphic styling system used across the application. Any new component or project adopting this design language should follow these rules and tokens.

---

## 1. Design Philosophy & Aesthetic Principles

- **Sleek Glassmorphism**: Translucent floating layers with high backdrop-blur (`backdrop-blur-xl` or `backdrop-blur-2xl`) combined with delicate borders (`1px solid var(--border-light)`).
- **Apple Modern Minimalist**: Porcelain whites and neutral grays in light mode; deep obsidian, zinc, and graphite in dark mode.
- **Adaptive Accent Hierarchy**: Vibrant primary accents (blue, cyan, pink, emerald, amber, rose) with corresponding soft translucent badges (`rgba(accent, 0.12)` - `rgba(accent, 0.20)`).
- **Micro-Interactions**: Soft hover elevations (`translateY(-2px)`), smooth transitions (`0.2s ease`), and glowing selection borders.

---

## 2. Core Design Tokens (CSS Variables)

All color tokens are mapped to CSS custom properties on `document.documentElement` (`:root`, `[data-theme="light"]`, and `[data-theme="dark"]`).

### Sizing, Radii & Shadows
```css
:root {
  --font-sans: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --radius: 14px;
  --radius-sm: 8px;
  --radius-full: 9999px;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.12);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.18);
  --transition: 0.2s ease;
  --max-width: 1680px;
}
```

### Color Token Contract
| CSS Variable | Role / Usage | Modern Apple (Dark) | Modern Apple (Light) |
| :--- | :--- | :--- | :--- |
| `--bg-primary` | Main page canvas background | `#0d0d0f` | `#f5f5f7` |
| `--bg-secondary` | Navbars, headers, sidebars | `#1c1c1e` | `#ffffff` |
| `--bg-tertiary` | Segmented controls, badge pills | `#2c2c2e` | `#f0f0f2` |
| `--bg-hover` | Hover states on list items & buttons | `#3a3a3c` | `#e8e8ec` |
| `--card-bg` | Surface background for cards & modals | `#1c1c1e` | `#ffffff` |
| `--card-border` | Subtle perimeter border on cards | `#2c2c2e` | `#e5e5ea` |
| `--border` | Dividers, standard inputs | `#38383a` | `#d2d2d7` |
| `--border-light` | Ultra-subtle glass borders | `#2c2c2e` | `#e5e5ea` |
| `--text-primary` | High-contrast primary copy & titles | `#f5f5f7` | `#1d1d1f` |
| `--text-secondary` | Secondary text, captions, subtitles | `#a1a1a6` | `#6e6e73` |
| `--text-tertiary` | Muted hints, placeholders | `#636366` | `#aeaeb2` |
| `--accent` | Key brand actions, primary buttons | `#0a84ff` | `#0071e3` |
| `--accent-hover` | Hover state for accent buttons | `#409cff` | `#0077ed` |
| `--accent-bg` | Tinted background for active states | `rgba(10,132,255,0.12)` | `rgba(0,113,227,0.08)` |
| `--danger` | Error states, delete actions | `#ff453a` | `#ff3b30` |
| `--success` | Confirmed badges, active toggles | `#30d158` | `#34c759` |
| `--warning` | Alerts, star ratings | `#ffd60a` | `#ff9f0a` |
| `--modal-backdrop` | Overlay tint for background dimming | `rgba(0, 0, 0, 0.65)` | `rgba(0, 0, 0, 0.4)` |

---

## 3. Glassmorphism Patterns

### Navbar & Sticky Headers
```html
<header className="sticky top-0 z-30 bg-[var(--bg-secondary)]/85 backdrop-blur-xl border-b border-[var(--border-light)] px-4 py-3">
  ...
</header>
```

### Modals & Dialog Windows
```html
<!-- Backdrop -->
<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
  <!-- Dialog Window -->
  <div className="relative w-full max-w-2xl bg-[var(--card-bg)]/90 backdrop-blur-2xl border border-[var(--border-light)] rounded-2xl shadow-2xl overflow-hidden">
    ...
  </div>
</div>
```

### Apple Cards
```css
.apple-card {
  background-color: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
}

.apple-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--accent);
}
```

### Apple Buttons
```css
.apple-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  transition: all var(--transition);
  white-space: nowrap;
}

.apple-btn-primary {
  background-color: var(--accent);
  color: #ffffff;
}

.apple-btn-primary:hover {
  background-color: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.apple-btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.apple-btn-ghost:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}
```

---

## 4. Preset Theme Palettes

The system includes 7 curated theme presets with paired dark and light mode color sets:

1. **Modern Apple (`default`)**
   - *Dark*: `#0d0d0f` (bg), `#1c1c1e` (card), `#0a84ff` (accent)
   - *Light*: `#f5f5f7` (bg), `#ffffff` (card), `#0071e3` (accent)
2. **Ocean Sapphire (`midnight-sapphire`)**
   - *Dark*: Deep navy `#0b1329`, card `#152259`, electric cyan accent `#38bdf8`
   - *Light*: Polar azure `#f0f7ff`, card `#ffffff`, ocean azure accent `#0284c7`
3. **Cyberpunk Neon (`cyberpunk-neon`)**
   - *Dark*: Onyx night `#09090b`, card `#18181b`, neon fuchsia accent `#ec4899`
   - *Light*: Light magenta wash `#fdf4f8`, card `#ffffff`, deep pink accent `#db2777`
4. **Emerald Forest (`emerald-forest`)**
   - *Dark*: Pine woods `#041c14`, card `#0b3b2c`, emerald accent `#10b981`
   - *Light*: Sage wash `#f0fdf4`, card `#ffffff`, botanical green accent `#059669`
5. **Sunset Amber (`sunset-amber`)**
   - *Dark*: Charcoal `#1c1917`, card `#292524`, warm amber accent `#f97316`
   - *Light*: Warm cream `#fff7ed`, card `#ffffff`, burnt orange accent `#ea580c`
6. **Rose Velvet (`rose-velvet`)**
   - *Dark*: Plum midnight `#1a101f`, card `#291830`, vivid rose accent `#f43f5e`
   - *Light*: Blush rosé `#fff1f2`, card `#ffffff`, crimson rose accent `#e11d48`
7. **Nordic Frost (`nordic-frost`)**
   - *Dark*: Polar slate `#242933`, card `#2e3440`, ice blue accent `#88c0d0`
   - *Light*: Scandinavian frost `#f4f6f9`, card `#ffffff`, fjord blue accent `#5e81ac`

---

## 5. Dynamic Tag / Category Tinting Formula

For custom category or genre tags, background and border colors are calculated dynamically from a base hex color:
- **Dark Mode**: `rgba(r, g, b, 0.20)` background, `rgba(r, g, b, 0.40)` border.
- **Light Mode**: `rgba(r, g, b, 0.12)` background, `rgba(r, g, b, 0.25)` border.

---

## 6. Local Storage Persistence Schema

| Key | Purpose | Example Value |
| :--- | :--- | :--- |
| `app_theme` | Active mode | `'dark'` \| `'light'` |
| `app_active_preset` | Active preset ID | `'midnight-sapphire'` |
| `app_custom_colors` | User-overridden CSS properties | `{"--accent": "#10b981"}` |
| `app_category_colors` | Custom category tag color mappings | `{"action": "#ff453a"}` |
