import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!request.cookies.has("careledger_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/patients/:path*",
    "/doctors/:path*",
    "/opd/:path*",
    "/diagnostics/:path*",
    "/ot/:path*",
    "/configuration/:path*",
    "/inventory/:path*",
    "/finance/:path*",
    "/reports/:path*",
    "/rooms/:path*",
    "/users/:path*",
  ],
};
