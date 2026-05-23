import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "access_token";
const LOGIN_PATH = "/login";

function getSecret(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ??
    process.env.NEXT_PUBLIC_JWT_SECRET ??
    "dns-cleaner-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

async function isValidToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isLoginPage = pathname === LOGIN_PATH;

  if (isLoginPage) {
    if (token && (await isValidToken(token))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!token || !(await isValidToken(token))) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
