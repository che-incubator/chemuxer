import { describe, it, expectTypeOf } from 'vitest';
import type { DevfileCommand } from '../devfile-command.js';

describe('DevfileCommand type', () => {
  it('has expected shape', () => {
    const cmd: DevfileCommand = {
      id: 'build',
      label: 'Build Project',
      component: 'dev-container',
      commandLine: 'go build ./...',
      workingDir: '${PROJECT_SOURCE}',
      group: 'build',
      isDefault: true,
    };
    expectTypeOf(cmd).toMatchTypeOf<DevfileCommand>();
  });

  it('allows optional fields to be absent', () => {
    const cmd: DevfileCommand = {
      id: 'run',
      component: 'dev-container',
      commandLine: 'go run .',
    };
    expectTypeOf(cmd).toMatchTypeOf<DevfileCommand>();
  });
});
