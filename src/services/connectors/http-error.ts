import { NextResponse } from "next/server";

import { asConnectorError } from "@/services/connectors/connector-error";

export function connectorErrorResponse(error: unknown) {
  const connector = asConnectorError(error);
  if (connector) {
    return NextResponse.json(
      {
        status: connector.code === "rate_limited" ? "rate_limited" : "failed",
        error: {
          code: connector.code,
          message: connector.message,
          status: connector.status,
          retryAfterSeconds: connector.retryAfterSeconds,
        },
      },
      { status: connector.status },
    );
  }

  return NextResponse.json(
    {
      status: "failed",
      error: {
        code: "internal_error",
        message: "검색 처리 중 서버 오류가 발생했습니다.",
        status: 500,
      },
    },
    { status: 500 },
  );
}
