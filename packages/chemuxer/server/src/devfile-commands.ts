import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { DevfileCommand } from '@chemuxer/shared';

const DEFAULT_METADATA_PATH = '/devworkspace-metadata/flattened.devworkspace.yaml';

export function parseDevfileCommands(yamlContent: string): DevfileCommand[] {
  try {
    const doc = parse(yamlContent) as Record<string, unknown>;
    if (!doc || !Array.isArray(doc.commands)) return [];

    const results: DevfileCommand[] = [];
    for (const entry of doc.commands) {
      if (!entry || typeof entry !== 'object') continue;
      const { id, exec } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || !exec || typeof exec !== 'object') continue;

      const e = exec as Record<string, unknown>;
      if (typeof e.commandLine !== 'string' || typeof e.component !== 'string') continue;

      const group = e.group && typeof e.group === 'object'
        ? (e.group as Record<string, unknown>)
        : null;

      results.push({
        id,
        label: typeof e.label === 'string' ? e.label : undefined,
        component: e.component,
        commandLine: e.commandLine,
        workingDir: typeof e.workingDir === 'string' ? e.workingDir : undefined,
        group: group && typeof group.kind === 'string' ? group.kind : undefined,
        isDefault: group && typeof group.isDefault === 'boolean' ? group.isDefault : undefined,
      });
    }
    return results;
  } catch {
    return [];
  }
}

export function loadDevfileCommands(metadataPath = DEFAULT_METADATA_PATH): DevfileCommand[] {
  try {
    const content = readFileSync(metadataPath, 'utf8');
    return parseDevfileCommands(content);
  } catch {
    return [];
  }
}
