import { createDefaultSettings, sanitizeSettings } from './pattern';
import type { MetronomeSettings } from './types';

const STORAGE_KEY = 'musica.metronome.v1';

export function loadMetronomeSettings(): MetronomeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    // Corrupted or unavailable storage must never block the metronome.
    return createDefaultSettings();
  }
}

export function saveMetronomeSettings(settings: MetronomeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Keep running with the in-memory settings.
  }
}
