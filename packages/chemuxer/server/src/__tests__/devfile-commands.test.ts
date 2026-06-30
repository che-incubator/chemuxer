import { describe, it, expect } from 'vitest';
import { parseDevfileCommands } from '../devfile-commands.js';

const YAML_WITH_EXEC_AND_APPLY = `
commands:
- id: "build"
  exec:
    commandLine: "go build ./..."
    component: "dev-container"
    label: "Build Project"
    workingDir: "\${PROJECT_SOURCE}"
    group:
      kind: "build"
      isDefault: true
- id: "test"
  exec:
    commandLine: "go test ./..."
    component: "dev-container"
- id: "injector"
  apply:
    component: "injector"
- id: "compound"
  composite:
    commands: ["build", "test"]
`;

const YAML_NO_COMMANDS = `
metadata:
  name: my-workspace
`;

const YAML_EMPTY_COMMANDS = `
commands: []
`;

describe('parseDevfileCommands', () => {
  it('returns only exec commands', () => {
    const result = parseDevfileCommands(YAML_WITH_EXEC_AND_APPLY);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('build');
    expect(result[1].id).toBe('test');
  });

  it('maps exec fields to DevfileCommand shape', () => {
    const result = parseDevfileCommands(YAML_WITH_EXEC_AND_APPLY);
    const build = result[0];
    expect(build.id).toBe('build');
    expect(build.label).toBe('Build Project');
    expect(build.component).toBe('dev-container');
    expect(build.commandLine).toBe('go build ./...');
    expect(build.workingDir).toBe('${PROJECT_SOURCE}');
    expect(build.group).toBe('build');
    expect(build.isDefault).toBe(true);
  });

  it('handles exec command without optional fields', () => {
    const result = parseDevfileCommands(YAML_WITH_EXEC_AND_APPLY);
    const test = result[1];
    expect(test.id).toBe('test');
    expect(test.label).toBeUndefined();
    expect(test.workingDir).toBeUndefined();
    expect(test.group).toBeUndefined();
    expect(test.isDefault).toBeUndefined();
  });

  it('returns empty array when no commands key', () => {
    expect(parseDevfileCommands(YAML_NO_COMMANDS)).toEqual([]);
  });

  it('returns empty array when commands is empty', () => {
    expect(parseDevfileCommands(YAML_EMPTY_COMMANDS)).toEqual([]);
  });

  it('returns empty array for malformed YAML', () => {
    expect(parseDevfileCommands('{ bad yaml: [')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseDevfileCommands('')).toEqual([]);
  });
});
