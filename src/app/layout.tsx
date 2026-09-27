import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "임상개발 검토 시스템",
  description: "근거 기반 임상개발 검토",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  );
}
