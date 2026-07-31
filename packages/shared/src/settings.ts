export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
  // UI chrome
  base: string;
  mantle: string;
  crust: string;
  surface0: string;
  overlay0: string;
  text: string;
  subtext0: string;
}

function deepFreeze<T extends object>(obj: T): T {
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') deepFreeze(val);
  }
  return Object.freeze(obj);
}

export const THEMES = {
  'catppuccin-mocha': {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#585b7066',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
    base: '#1e1e2e',
    mantle: '#181825',
    crust: '#11111b',
    surface0: '#313244',
    overlay0: '#6c7086',
    text: '#cdd6f4',
    subtext0: '#a6adc8',
  },
  'catppuccin-latte': {
    background: '#eff1f5',
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    selectionBackground: '#acb0be66',
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#ea76cb',
    cyan: '#179299',
    white: '#acb0be',
    brightBlack: '#6c6f85',
    brightRed: '#d20f39',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#ea76cb',
    brightCyan: '#179299',
    brightWhite: '#bcc0cc',
    base: '#eff1f5',
    mantle: '#e6e9ef',
    crust: '#dce0e8',
    surface0: '#ccd0da',
    overlay0: '#9ca0b0',
    text: '#4c4f69',
    subtext0: '#6c6f85',
  },
} as const satisfies Record<string, TerminalTheme>;

deepFreeze(THEMES);

export type ThemeName = keyof typeof THEMES;

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  theme: ThemeName;
  dimInactivePanes: boolean;
  inactivePaneDimAmount: number;
}

export interface ShellSettings {
  path: string;
}

export interface ScrollbackSettings {
  lines: number;
}

export interface Settings {
  terminal: TerminalSettings;
  shell: ShellSettings;
  scrollback: ScrollbackSettings;
}

export const DEFAULT_SETTINGS: Settings = deepFreeze({
  terminal: {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
    fontSize: 14,
    theme: 'catppuccin-mocha',
    dimInactivePanes: true,
    inactivePaneDimAmount: 0.7,
  },
  shell: {
    path: '',
  },
  scrollback: {
    lines: 5000,
  },
});

export function resolveTheme(themeName: string): TerminalTheme {
  return THEMES[themeName as ThemeName] ?? THEMES[DEFAULT_SETTINGS.terminal.theme];
}

export function clampSettings(settings: Settings): Settings {
  return {
    ...settings,
    terminal: {
      ...settings.terminal,
      fontSize: Math.min(32, Math.max(8, settings.terminal.fontSize)),
      theme: settings.terminal.theme in THEMES ? settings.terminal.theme : DEFAULT_SETTINGS.terminal.theme,
      inactivePaneDimAmount: Math.min(1.0, Math.max(0.1, settings.terminal.inactivePaneDimAmount)),
    },
    scrollback: {
      ...settings.scrollback,
      lines: Math.min(50000, Math.max(100, settings.scrollback.lines)),
    },
  };
}

export function mergeWithDefaults(partial: Partial<Settings>): Settings {
  return clampSettings({
    terminal: {
      ...DEFAULT_SETTINGS.terminal,
      ...(partial?.terminal ?? {}),
    },
    shell: {
      ...DEFAULT_SETTINGS.shell,
      ...(partial?.shell ?? {}),
    },
    scrollback: {
      ...DEFAULT_SETTINGS.scrollback,
      ...(partial?.scrollback ?? {}),
    },
  });
}
