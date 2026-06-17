export type ErrorCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_NOT_READY'
  | 'WORKSPACE_UNREACHABLE'
  | 'WORKSPACE_IDLED'
  | 'TERMINAL_NOT_FOUND'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR';

export class ToolError extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface WorkspaceStatus {
  workspace_name: string;
  ready: boolean;
  phase: string;
  idled: boolean;
}
