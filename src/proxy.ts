import { NextResponse, type NextRequest } from "next/server";
import { isAllowedHost, parseAllowedHosts } from "@/lib/domain/host";

/**
 * Answers only requests addressed to localhost (see isAllowedHost for why). To reach the app by
 * another name, e.g. a LAN hostname you trust, set ALLOWED_HOSTS="my-pc.local" and restart.
 */
export function proxy(request: NextRequest) {
  const extra = parseAllowedHosts(process.env.ALLOWED_HOSTS);
  if (!isAllowedHost(request.headers.get("host"), extra)) {
    return new NextResponse("Forbidden: this app only answers requests addressed to localhost.", { status: 403 });
  }
  return NextResponse.next();
}
