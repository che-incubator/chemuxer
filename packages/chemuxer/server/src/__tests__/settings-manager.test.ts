import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SettingsManager } from '../settings-manager.js';

describe('SettingsManager', () => {
  let tmpDir: string;
  let configPath: string;
  let manager: SettingsManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtm-test-'));
    configPath = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    manager?.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates default config file if missing', () => {
    manager = new SettingsManager(configPath);
    expect(fs.existsSync(configPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.terminal.fontSize).toBe(14);
  });

  it('reads and merges partial config with defaults', () => {
    fs.writeFileSync(configPath, JSON.stringify({ terminal: { fontSize: 18 } }));
    manager = new SettingsManager(configPath);
    const settings = manager.getSettings();
    expect(settings.terminal.fontSize).toBe(18);
    expect(settings.terminal.fontFamily).toContain('JetBrains Mono');
    expect(settings.scrollback.lines).toBe(5000);
  });

  it('clamps out-of-range fontSize', () => {
    fs.writeFileSync(configPath, JSON.stringify({ terminal: { fontSize: 100 } }));
    manager = new SettingsManager(configPath);
    expect(manager.getSettings().terminal.fontSize).toBe(32);
  });

  it('clamps out-of-range scrollback lines', () => {
    fs.writeFileSync(configPath, JSON.stringify({ scrollback: { lines: 50 } }));
    manager = new SettingsManager(configPath);
    expect(manager.getSettings().scrollback.lines).toBe(100);
  });

  it('falls back to defaults on invalid JSON', () => {
    fs.writeFileSync(configPath, 'not json{{{');
    manager = new SettingsManager(configPath);
    expect(manager.getSettings().terminal.fontSize).toBe(14);
  });

  it('writeSettings updates file and returns new settings', () => {
    manager = new SettingsManager(configPath);
    const updated = manager.writeSettings({ terminal: { fontSize: 20 } });
    expect(updated.terminal.fontSize).toBe(20);
    const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(onDisk.terminal.fontSize).toBe(20);
  });

  it('writeSettingsRaw rejects invalid JSON string', () => {
    manager = new SettingsManager(configPath);
    expect(() => manager.writeSettingsRaw('not json{{{')).toThrow();
  });

  it('emits change event on writeSettings', () => {
    manager = new SettingsManager(configPath);
    let emitted = false;
    manager.onChange(() => { emitted = true; });
    manager.writeSettings({ terminal: { fontSize: 22 } });
    expect(emitted).toBe(true);
  });

  it('getSchemaString returns valid JSON', () => {
    manager = new SettingsManager(configPath);
    const schema = manager.getSchemaString();
    expect(() => JSON.parse(schema)).not.toThrow();
    expect(JSON.parse(schema).title).toBe('Chemuxer Settings');
  });

  it('schema enum includes both themes', () => {
    manager = new SettingsManager(configPath);
    const schema = JSON.parse(manager.getSchemaString());
    const themeEnum = schema.properties.terminal.properties.theme.enum;
    expect(themeEnum).toContain('catppuccin-mocha');
    expect(themeEnum).toContain('catppuccin-latte');
  });
});
