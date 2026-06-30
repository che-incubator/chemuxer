import { useState, useEffect, useMemo } from 'react';
import { Command } from 'cmdk';
import type { Command as CommandType } from '../hooks/useCommands.js';
import type { DevfileCommand } from '@chemuxer/shared';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandType[];
  devfileCommands?: DevfileCommand[];
  onRunDevfileCommand?: (commandId: string) => void;
}

// Group order (fixed)
const GROUP_ORDER = ['build', 'run', 'test', 'debug'] as const;
type KnownGroup = typeof GROUP_ORDER[number];

function groupDevfileCommands(commands: DevfileCommand[]): Map<string, DevfileCommand[]> {
  const groups = new Map<string, DevfileCommand[]>();

  for (const cmd of commands) {
    const group = cmd.group || 'other';
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(cmd);
  }

  // Sort commands alphabetically within each group
  for (const [, cmds] of groups) {
    cmds.sort((a, b) => {
      const aLabel = a.label || a.id;
      const bLabel = b.label || b.id;
      return aLabel.localeCompare(bLabel);
    });
  }

  return groups;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  devfileCommands = [],
  onRunDevfileCommand,
}: CommandPaletteProps) {
  const [stack, setStack] = useState<{ label: string; commands: CommandType[] }[]>([]);

  const groupedDevfileCommands = useMemo(
    () => groupDevfileCommands(devfileCommands),
    [devfileCommands]
  );

  useEffect(() => {
    if (open) {
      setStack([{ label: '', commands }]);
    }
  }, [open, commands]);

  const current = stack[stack.length - 1];
  const isSubLevel = stack.length > 1;

  const handleSelect = (cmd: CommandType) => {
    if (cmd.disabled) return;
    if (cmd.children) {
      setStack((prev) => [...prev, { label: cmd.label, commands: cmd.children! }]);
    } else if (cmd.action) {
      cmd.action();
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (isSubLevel) {
        setStack((prev) => prev.slice(0, -1));
      } else {
        onOpenChange(false);
      }
    }
  };

  if (!current) return null;

  const placeholder = isSubLevel ? `${current.label} >` : 'Type a command...';

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      className="command-palette"
      onKeyDown={handleKeyDown}
    >
      <Command.Input
        placeholder={placeholder}
        className="command-palette-input"
      />
      <Command.List className="command-palette-list">
        <Command.Empty className="command-palette-empty">
          No commands found.
        </Command.Empty>
        {current.commands.map((cmd) => (
          <Command.Item
            key={cmd.id}
            value={cmd.label}
            disabled={cmd.disabled}
            onSelect={() => handleSelect(cmd)}
            className="command-palette-item"
          >
            {cmd.label}
          </Command.Item>
        ))}

        {/* Devfile command groups */}
        {devfileCommands.length > 0 && (
          <>
            {/* Render known groups in fixed order */}
            {GROUP_ORDER.map((groupKey) => {
              const cmds = groupedDevfileCommands.get(groupKey);
              if (!cmds || cmds.length === 0) return null;

              const groupLabel = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);

              return (
                <Command.Group key={groupKey} heading={groupLabel}>
                  {cmds.map((cmd) => (
                    <Command.Item
                      key={cmd.id}
                      value={cmd.label || cmd.id}
                      onSelect={() => {
                        onRunDevfileCommand?.(cmd.id);
                        onOpenChange(false);
                      }}
                      className="command-palette-item"
                    >
                      <span>{cmd.label || cmd.id}</span>
                      <span className="text-muted ml-2">component: {cmd.component}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}

            {/* Render "Other" group last */}
            {groupedDevfileCommands.get('other') && (
              <Command.Group heading="Other">
                {groupedDevfileCommands.get('other')!.map((cmd) => (
                  <Command.Item
                    key={cmd.id}
                    value={cmd.label || cmd.id}
                    onSelect={() => {
                      onRunDevfileCommand?.(cmd.id);
                      onOpenChange(false);
                    }}
                    className="command-palette-item"
                  >
                    <span>{cmd.label || cmd.id}</span>
                    <span className="text-muted ml-2">component: {cmd.component}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
