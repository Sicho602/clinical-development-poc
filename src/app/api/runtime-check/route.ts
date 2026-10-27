import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  console.log('[Runtime Check] Node.js:', process.version);

  return NextResponse.json({
    status: 'ok'
  });
}
