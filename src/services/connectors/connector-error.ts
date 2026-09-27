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
  if (error instanceof ConnectorError) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };

  return (
    candidate.name === "ConnectorError" &&
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.message === "string"
  );
}

export function asConnectorError(error: unknown): ConnectorError | null {
  if (error instanceof ConnectorError) {
    return error;
  }

  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    status?: unknown;
    retryAfterSeconds?: unknown;
  };

  if (
    candidate.name !== "ConnectorError" ||
    typeof candidate.code !== "string" ||
    typeof candidate.message !== "string" ||
    typeof candidate.status !== "number"
  ) {
    return null;
  }

  return new ConnectorError(
    candidate.code as ConnectorErrorCode,
    candidate.message,
    candidate.status,
    typeof candidate.retryAfterSeconds === "number"
      ? candidate.retryAfterSeconds
      : undefined,
  );
}
