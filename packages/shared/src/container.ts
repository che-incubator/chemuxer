export type ContainerState = 'running' | 'waiting' | 'terminated';

export interface ContainerInfo {
  name: string;
  state: ContainerState;
  ready: boolean;
  isDefault: boolean;
}
