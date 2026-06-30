import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../components/CommandPalette';
import type { DevfileCommand } from '@chemuxer/shared';

describe('CommandPalette with devfile commands', () => {
  const mockCommands = [
    { id: 'settings', label: 'Settings', action: vi.fn() },
    { id: 'close', label: 'Close', action: vi.fn() },
  ];

  const mockDevfileCommands: DevfileCommand[] = [
    {
      id: 'build-app',
      label: 'Build Application',
      component: 'tools',
      commandLine: 'npm run build',
      group: 'build',
    },
    {
      id: 'build-docs',
      component: 'tools',
      commandLine: 'npm run docs',
      group: 'build',
    },
    {
      id: 'test-unit',
      label: 'Unit Tests',
      component: 'tools',
      commandLine: 'npm test',
      group: 'test',
    },
    {
      id: 'custom',
      component: 'tools',
      commandLine: 'echo hello',
    },
  ];

  it('should render devfile commands in groups', () => {
    const onRunDevfileCommand = vi.fn();

    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={mockCommands}
        devfileCommands={mockDevfileCommands}
        onRunDevfileCommand={onRunDevfileCommand}
      />
    );

    // Groups should appear in fixed order
    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();

    // Commands should show label or id
    expect(screen.getByText('Build Application')).toBeInTheDocument();
    expect(screen.getByText('build-docs')).toBeInTheDocument();
    expect(screen.getByText('Unit Tests')).toBeInTheDocument();

    // Component should appear as muted suffix
    expect(screen.getAllByText(/component: tools/)).toHaveLength(4);
  });

  it('should sort commands alphabetically within groups', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={mockCommands}
        devfileCommands={mockDevfileCommands}
        onRunDevfileCommand={vi.fn()}
      />
    );

    const buildGroup = screen.getByText('Build').closest('[cmdk-group]');
    const items = buildGroup?.querySelectorAll('[cmdk-item]');

    expect(items?.[0]).toHaveTextContent('Build Application');
    expect(items?.[1]).toHaveTextContent('build-docs');
  });

  it('should call onRunDevfileCommand when command is selected', async () => {
    const onRunDevfileCommand = vi.fn();
    const user = userEvent.setup();

    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={mockCommands}
        devfileCommands={mockDevfileCommands}
        onRunDevfileCommand={onRunDevfileCommand}
      />
    );

    await user.click(screen.getByText('Build Application'));

    expect(onRunDevfileCommand).toHaveBeenCalledWith('build-app');
  });

  it('should not render devfile groups when no commands provided', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={mockCommands}
      />
    );

    expect(screen.queryByText('Build')).not.toBeInTheDocument();
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });
});
