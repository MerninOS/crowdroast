import crypto from "crypto";
import { NextResponse } from "next/server";

function getBearerToken(header: string | null) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token || null;
}

// Constant-time compare so callers can't probe the secret byte-by-byte via
// response timing. timingSafeEqual throws on length mismatch, so we pad both
// sides to the same buffer length first.
function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  const len = Math.max(aBuf.length, bBuf.length);
  const aPadded = Buffer.alloc(len);
  const bPadded = Buffer.alloc(len);
  aBuf.copy(aPadded);
  bBuf.copy(bPadded);
  const equal = crypto.timingSafeEqual(aPadded, bPadded);
  return equal && aBuf.length === bBuf.length;
}

export function authorizeCronRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const bearer = getBearerToken(request.headers.get("authorization"));
  const headerSecret = request.headers.get("x-cron-secret");

  const matches =
    (bearer !== null && constantTimeEquals(bearer, cronSecret)) ||
    (headerSecret !== null && constantTimeEquals(headerSecret, cronSecret));

  if (!matches) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
