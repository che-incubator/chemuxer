import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import type { Command as CommandType } from '../hooks/useCommands.js';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandType[];
}

export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const [stack, setStack] = useState<{ label: string; commands: CommandType[] }[]>([]);

  useEffect(() => {
    if (open) {
      setStack([{ label: '', commands }]);
    }
  }, [open, commands]);

  const current = stack[stack.length - 1];
  const isSubLevel = stack.length > 1;

  const handleSelect = (cmd: CommandType) => {
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
            onSelect={() => handleSelect(cmd)}
            className="command-palette-item"
          >
            {cmd.label}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
