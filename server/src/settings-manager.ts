import fs from 'fs';
import path from 'path';
import { mergeWithDefaults, DEFAULT_SETTINGS, type Settings } from '../../shared/settings.js';

type ChangeCallback = (settings: Settings) => void;

export class SettingsManager {
  private settings: Settings;
  private configPath: string;
  private schemaString: string;
  private changeListeners: ChangeCallback[] = [];
  private watcher: fs.FSWatcher | null = null;

  constructor(configPath: string) {
    this.configPath = configPath;

    const schemaPath = path.resolve(__dirname, 'settings-schema.json');
    try {
      this.schemaString = fs.readFileSync(schemaPath, 'utf-8');
    } catch (e) {
      console.warn('[SettingsManager] Failed to read settings schema:', e);
      this.schemaString = '{}';
    }

    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      this.settings = { ...DEFAULT_SETTINGS };
    } else {
      this.settings = this.readFromDisk();
    }

    try {
      this.watcher = fs.watch(configPath, () => {
        const updated = this.readFromDisk();
        this.settings = updated;
        this.notifyChange();
      });
    } catch {
      console.warn('[SettingsManager] fs.watch not available, settings hot-reload disabled');
    }
  }

  private readFromDisk(): Settings {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return mergeWithDefaults(parsed);
    } catch (e) {
      console.warn('[SettingsManager] Failed to read settings, using defaults:', e);
      return { ...DEFAULT_SETTINGS };
    }
  }

  private notifyChange(): void {
    for (const cb of this.changeListeners) {
      cb(this.settings);
    }
  }

  getSettings(): Settings {
    return this.settings;
  }

  getSchemaString(): string {
    return this.schemaString;
  }

  writeSettings(partial: Partial<Settings>): Settings {
    const merged = mergeWithDefaults({ ...this.settingsToRaw(), ...partial });
    this.settings = merged;
    fs.writeFileSync(this.configPath, JSON.stringify(merged, null, 2));
    this.notifyChange();
    return merged;
  }

  writeSettingsRaw(jsonString: string): Settings {
    const parsed = JSON.parse(jsonString);
    return this.writeSettings(parsed);
  }

  private settingsToRaw(): Settings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  onChange(cb: ChangeCallback): void {
    this.changeListeners.push(cb);
  }

  dispose(): void {
    this.watcher?.close();
    this.changeListeners = [];
  }
}
