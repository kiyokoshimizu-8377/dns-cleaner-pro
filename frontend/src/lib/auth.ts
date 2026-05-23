import { jwtVerify } from "jose";

export const ACCESS_TOKEN_KEY = "accessToken";
export const SESSION_COOKIE = "access_token";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
};

export type AuthResponse = {
  access_token: string;
  user: AuthUser;
};

function getJwtSecret(): Uint8Array | null {
  const secret =
    process.env.JWT_SECRET ??
    process.env.NEXT_PUBLIC_JWT_SECRET ??
    "dns-cleaner-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export function setSession(auth: AuthResponse): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, auth.access_token);
  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("currentUser", JSON.stringify(auth.user));
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(auth.access_token)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("currentUser");
  localStorage.removeItem("token");
  localStorage.removeItem("isAuthenticated");
  localStorage.removeItem("user");
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("currentUser");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function verifyToken(token: string): Promise<boolean> {
  const secret = getJwtSecret();
  if (!secret) return false;
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function isSessionValid(): Promise<boolean> {
  const token = getAccessToken();
  if (!token || localStorage.getItem("isLoggedIn") !== "true") {
    return false;
  }

  const user = getStoredUser();
  if (!user || user.status !== "active") {
    return false;
  }

  const valid = await verifyToken(token);
  if (!valid) return false;

  try {
    const baseURL =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    const res = await fetch(`${baseURL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthUser;
    localStorage.setItem("currentUser", JSON.stringify(data));
    return data.status === "active";
  } catch {
    return false;
  }
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function loginRequest(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { response: { data: body } };
  }
  return res.json() as Promise<AuthResponse>;
}

export async function registerRequest(payload: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { response: { data: body } };
  }
  return res.json() as Promise<AuthResponse>;
}

export async function logoutRequest(): Promise<void> {
  const token = getAccessToken();
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    // ignore network errors on logout
  } finally {
    clearSession();
  }
}
