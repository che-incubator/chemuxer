import { useRef, useEffect, useMemo, useState } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { Settings } from '../../../shared/settings.js';
import { basePath } from '../utils/basePath.js';

interface SettingsEditorProps {
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  visible: boolean;
}

export function SettingsEditor({ settings, onSave, visible }: SettingsEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [saveError, setSaveError] = useState<string | null>(null);
  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    fetch(`${basePath()}/api/settings/schema`)
      .then((res) => res.json())
      .then((schema) => {
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
          validate: true,
          schemas: [
            {
              uri: 'https://chemuxer/settings.schema.json',
              fileMatch: ['*'],
              schema,
            },
          ],
        });
      })
      .catch((err) => console.warn('Failed to fetch settings schema:', err));

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const value = editor.getValue();
      try {
        const parsed = JSON.parse(value);
        onSaveRef.current(parsed).catch((err: Error) => {
          setSaveError(err.message);
        });
      } catch {}
    });

    editor.onDidChangeModelContent(() => {
      setSaveError(null);
    });
  };

  useEffect(() => {
    if (editorRef.current) {
      const currentValue = editorRef.current.getValue();
      if (currentValue !== settingsJson) {
        editorRef.current.setValue(settingsJson);
      }
    }
  }, [settingsJson]);

  return (
    <div className="settings-editor" style={{ display: visible ? 'flex' : 'none', flexDirection: 'column' }}>
      {saveError && (
        <div className="settings-error">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)}>&times;</button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          language="json"
          theme={settings.terminal.theme.includes('mocha') ? 'vs-dark' : 'vs'}
          value={settingsJson}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}
