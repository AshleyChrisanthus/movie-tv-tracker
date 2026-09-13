export type ThemeMode = 'light' | 'dark';

export interface ThemeTokens {
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-tertiary'?: string;
  '--bg-hover': string;
  '--card-bg': string;
  '--card-border'?: string;
  '--modal-bg'?: string;
  '--modal-backdrop'?: string;
  '--input-bg'?: string;
  '--input-border'?: string;
  '--input-focus'?: string;
  '--text-primary': string;
  '--text-secondary': string;
  '--text-tertiary'?: string;
  '--border'?: string;
  '--border-light': string;
  '--accent': string;
  '--accent-hover': string;
  '--accent-bg'?: string;
  '--tag-bg': string;
  '--tag-text': string;
  '--danger'?: string;
  '--danger-hover'?: string;
  '--success'?: string;
  '--warning'?: string;
  '--scrollbar-thumb'?: string;
  '--toast-bg'?: string;
  '--toast-text'?: string;
  [key: `--${string}`]: string | undefined;
}

export interface ThemePreset {
  id: string;
  name: string;
  desc: string;
  dark: ThemeTokens;
  light: ThemeTokens;
  swatches: {
    dark: string[];
    light: string[];
  };
}

export type GenreColors = Record<string, string>;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface GenreTagStyle {
  color: string;
  backgroundColor: string;
  borderColor: string;
}
