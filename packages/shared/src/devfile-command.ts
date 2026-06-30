export interface DevfileCommand {
  id: string;
  label?: string;
  component: string;
  commandLine: string;
  workingDir?: string;
  group?: string;
  isDefault?: boolean;
}
