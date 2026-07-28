import { describe, it, expect } from 'vitest';
import { resolveTheme, THEMES, DEFAULT_SETTINGS, clampSettings } from '../settings.js';

describe('settings', () => {
  it('resolveTheme returns catppuccin-mocha for known name', () => {
    const theme = resolveTheme('catppuccin-mocha');
    expect(theme.background).toBe('#1e1e2e');
    expect(theme.base).toBe('#1e1e2e');
  });

  it('resolveTheme returns catppuccin-latte for known name', () => {
    const theme = resolveTheme('catppuccin-latte');
    expect(theme.background).toBe('#eff1f5');
    expect(theme.base).toBe('#eff1f5');
  });

  it('resolveTheme falls back to mocha for unknown name', () => {
    const theme = resolveTheme('nonexistent');
    expect(theme.background).toBe('#1e1e2e');
  });

  it('catppuccin-latte has all UI chrome fields', () => {
    const theme = THEMES['catppuccin-latte'];
    expect(theme.base).toBe('#eff1f5');
    expect(theme.mantle).toBe('#e6e9ef');
    expect(theme.crust).toBe('#dce0e8');
    expect(theme.surface0).toBe('#ccd0da');
    expect(theme.overlay0).toBe('#9ca0b0');
    expect(theme.text).toBe('#4c4f69');
    expect(theme.subtext0).toBe('#6c6f85');
    expect(theme.blue).toBe('#1e66f5');
    expect(theme.red).toBe('#d20f39');
  });

  it('catppuccin-mocha has all UI chrome fields', () => {
    const theme = THEMES['catppuccin-mocha'];
    expect(theme.base).toBe('#1e1e2e');
    expect(theme.mantle).toBe('#181825');
    expect(theme.crust).toBe('#11111b');
    expect(theme.surface0).toBe('#313244');
    expect(theme.overlay0).toBe('#6c7086');
    expect(theme.text).toBe('#cdd6f4');
    expect(theme.subtext0).toBe('#a6adc8');
    expect(theme.blue).toBe('#89b4fa');
    expect(theme.red).toBe('#f38ba8');
  });

  it('both themes have selectionBackground with alpha', () => {
    const mocha = THEMES['catppuccin-mocha'];
    const latte = THEMES['catppuccin-latte'];
    expect(mocha.selectionBackground).toBe('#585b7066');
    expect(latte.selectionBackground).toBe('#acb0be66');
  });

  it('DEFAULT_SETTINGS has scrollback.lines', () => {
    expect(DEFAULT_SETTINGS.scrollback.lines).toBe(5000);
  });

  it('DEFAULT_SETTINGS.terminal.dimInactivePanes is true', () => {
    expect(DEFAULT_SETTINGS.terminal.dimInactivePanes).toBe(true);
  });

  it('DEFAULT_SETTINGS.terminal.inactivePaneDimAmount is 0.7', () => {
    expect(DEFAULT_SETTINGS.terminal.inactivePaneDimAmount).toBe(0.7);
  });

  it('clampSettings clamps inactivePaneDimAmount above 1 to 1', () => {
    const result = clampSettings({
      ...DEFAULT_SETTINGS,
      terminal: { ...DEFAULT_SETTINGS.terminal, inactivePaneDimAmount: 1.5 },
    });
    expect(result.terminal.inactivePaneDimAmount).toBe(1);
  });

  it('clampSettings clamps inactivePaneDimAmount below 0 to 0', () => {
    const result = clampSettings({
      ...DEFAULT_SETTINGS,
      terminal: { ...DEFAULT_SETTINGS.terminal, inactivePaneDimAmount: -0.5 },
    });
    expect(result.terminal.inactivePaneDimAmount).toBe(0);
  });
});
