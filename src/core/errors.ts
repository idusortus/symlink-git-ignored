export type ToolErrorCode =
  | "CANCELLED"
  | "GIT_FAILED"
  | "INVALID_ARGUMENT"
  | "MANIFEST_MISSING"
  | "NOT_A_REPO"
  | "SELECT_NON_INTERACTIVE"
  | "SOURCE_BARE"
  | "SOURCE_IS_DESTINATION"
  | "SOURCE_MISSING"
  | "USAGE";

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly hint?: string;

  constructor(code: ToolErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.hint = hint;
  }
}

export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError;
}

export function exitCodeFor(error: unknown): number {
  return isToolError(error) && error.code === "CANCELLED" ? 130 : 1;
}

export function formatError(error: unknown): string {
  if (isToolError(error)) {
    return error.hint ? `error: ${error.message}\nhint: ${error.hint}` : `error: ${error.message}`;
  }
  if (error instanceof Error) {
    return `error: ${error.message}`;
  }
  return `error: ${String(error)}`;
}
