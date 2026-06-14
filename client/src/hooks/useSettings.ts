import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../../shared/settings.js';

export interface SettingsState {
  settings: Settings;
  updateSettings: (settings: Settings) => Promise<void>;
  applySettingsChanged: (settings: Settings) => void;
}

export function basePath(): string {
  return new URL('.', document.baseURI).pathname.replace(/\/+$/, '');
}

export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const cached = localStorage.getItem('chemuxer-settings:v1');
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    fetch(`${basePath()}/api/settings`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch settings');
      })
      .then((data: Settings) => {
        setSettings(data);
        localStorage.setItem('chemuxer-settings:v1', JSON.stringify(data));
      })
      .catch((err) => console.warn('Failed to fetch settings:', err));
  }, []);

  const updateSettings = useCallback(async (newSettings: Settings) => {
    const res = await fetch(`${basePath()}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    });
    if (res.ok) {
      const updated = await res.json();
      setSettings(updated);
      localStorage.setItem('chemuxer-settings:v1', JSON.stringify(updated));
    }
  }, []);

  const applySettingsChanged = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    localStorage.setItem('chemuxer-settings:v1', JSON.stringify(newSettings));
  }, []);

  return { settings, updateSettings, applySettingsChanged };
}
