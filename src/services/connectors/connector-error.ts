export type ConnectorErrorCode =
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "upstream_error"
  | "invalid_response"
  | "network_error";

export class ConnectorError extends Error {
  constructor(
    public readonly code: ConnectorErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ConnectorError";
  }
}

export function isConnectorError(error: unknown): error is ConnectorError {
  return error instanceof ConnectorError;
}
