import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getThemeModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Theme & Color Presets System', () => {
  let themeModule;

  beforeEach(async () => {
    await resetDatabase();
    themeModule = await getThemeModule();
  });

  it('should verify all 7 handcrafted theme presets with required variables and swatches', () => {
    const { THEME_PRESETS } = themeModule;
    assert.equal(THEME_PRESETS.length, 7);

    const requiredIds = [
      'default',
      'midnight-sapphire',
      'cyberpunk-neon',
      'emerald-forest',
      'sunset-amber',
      'rose-velvet',
      'nordic-frost'
    ];

    const presetIds = THEME_PRESETS.map(p => p.id);
    for (const id of requiredIds) {
      assert.ok(presetIds.includes(id), 'Missing preset: ' + id);
    }

    // Verify tokens in every preset
    const requiredVars = [
      '--bg-primary',
      '--bg-secondary',
      '--card-bg',
      '--bg-hover',
      '--text-primary',
      '--text-secondary',
      '--border-light',
      '--accent',
      '--accent-hover',
      '--tag-bg',
      '--tag-text'
    ];

    for (const preset of THEME_PRESETS) {
      assert.ok(preset.name, 'Preset missing name');
      assert.ok(preset.dark, 'Preset missing dark theme');
      assert.ok(preset.light, 'Preset missing light theme');
      assert.equal(preset.swatches.dark.length, 4, 'Dark swatches should have 4 colors');
      assert.equal(preset.swatches.light.length, 4, 'Light swatches should have 4 colors');

      for (const v of requiredVars) {
        assert.ok(preset.dark[v], 'Preset ' + preset.id + ' dark missing ' + v);
        assert.ok(preset.light[v], 'Preset ' + preset.id + ' light missing ' + v);
      }
    }
  });

  it('should accurately convert colors between HEX, RGB, and HSL', () => {
    const { hexToRgb, rgbToHex, hslToHex } = themeModule;

    // 6-digit hex
    const rgb6 = hexToRgb('#0a84ff');
    assert.deepEqual(rgb6, { r: 10, g: 132, b: 255 });

    // 3-digit hex
    const rgb3 = hexToRgb('#fff');
    assert.deepEqual(rgb3, { r: 255, g: 255, b: 255 });

    // Invalid hex
    assert.equal(hexToRgb('invalid'), null);
    assert.equal(hexToRgb(null), null);

    // RGB to Hex with zero padding
    const hex = rgbToHex(10, 132, 255);
    assert.equal(hex.toLowerCase(), '#0a84ff');

    const blackHex = rgbToHex(0, 0, 0);
    assert.equal(blackHex, '#000000');

    // HSL to Hex
    const redHex = hslToHex(0, 100, 50);
    assert.equal(redHex.toLowerCase(), '#ff0000');

    const blueHex = hslToHex(240, 100, 50);
    assert.equal(blueHex.toLowerCase(), '#0000ff');
  });

  it('should persist and retrieve custom genre colors and calculate dynamic tag styles', () => {
    const { setGenreColor, getGenreColors, getGenreTagStyle } = themeModule;

    // Initially empty
    assert.deepEqual(getGenreColors(), {});

    // Fallback tag style for unconfigured genre
    const fallbackStyle = getGenreTagStyle('Comedy');
    assert.equal(fallbackStyle.borderColor, 'transparent');
    assert.ok(fallbackStyle.backgroundColor.includes('var(--tag-bg'));

    // Configure custom genre color
    setGenreColor('Sci-Fi', '#38bdf8');
    const colors = getGenreColors();
    assert.equal(colors['sci-fi'], '#38bdf8');

    // Compute tag style with custom color
    const customStyle = getGenreTagStyle('Sci-Fi');
    assert.equal(customStyle.color, '#38bdf8');
    assert.ok(customStyle.backgroundColor.includes('56, 189, 248, 0.2'));
    assert.ok(customStyle.borderColor.includes('56, 189, 248, 0.4'));

    // Remove genre color
    setGenreColor('Sci-Fi', null);
    assert.equal(getGenreColors()['sci-fi'], undefined);
  });

  it('should toggle theme modes and update document attribute and localStorage', () => {
    const { initTheme, toggleThemeMode, THEME_KEY } = themeModule;

    initTheme();
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');

    // Toggle to light
    const next1 = toggleThemeMode();
    assert.equal(next1, 'light');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(localStorage.getItem(THEME_KEY), 'light');

    // Toggle back to dark
    const next2 = toggleThemeMode();
    assert.equal(next2, 'dark');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(localStorage.getItem(THEME_KEY), 'dark');
  });

  it('should apply custom user color overrides on top of presets', () => {
    const { applyPresetPaletteForMode, CUSTOM_THEME_KEY } = themeModule;

    const overrides = {
      dark: {
        '--accent': '#ff5500',
        '--card-bg': '#222222'
      }
    };
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(overrides));

    applyPresetPaletteForMode('dark');

    assert.equal(document.documentElement.style.getPropertyValue('--accent'), '#ff5500');
    assert.equal(document.documentElement.style.getPropertyValue('--card-bg'), '#222222');
    assert.equal(document.documentElement.style.getPropertyValue('--modal-bg'), '#222222');
  });
});
