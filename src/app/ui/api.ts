"use client";

/** Browser-side auth + fetch helper. Tokens live in localStorage; access token is
 *  auto-refreshed once on a 401 using the refresh token. */

const ACCESS = "fe_access";
const REFRESH = "fe_refresh";

export function getTokens(): { access: string | null; refresh: string | null } {
  if (typeof window === "undefined") return { access: null, refresh: null };
  return { access: localStorage.getItem(ACCESS), refresh: localStorage.getItem(REFRESH) };
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

export class AuthExpiredError extends Error {}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Login failed");
  setTokens(data.accessToken, data.refreshToken);
}

async function tryRefresh(): Promise<string | null> {
  const { refresh } = getTokens();
  if (!refresh) return null;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  localStorage.setItem(ACCESS, data.accessToken);
  return data.accessToken as string;
}

/** Authenticated GET returning parsed JSON. Refreshes + retries once on 401. */
export async function apiGet<T>(path: string): Promise<T> {
  let { access } = getTokens();
  if (!access) throw new AuthExpiredError();

  const call = (token: string) =>
    fetch(path, { headers: { authorization: `Bearer ${token}` } });

  let res = await call(access);
  if (res.status === 401) {
    const fresh = await tryRefresh();
    if (!fresh) {
      clearTokens();
      throw new AuthExpiredError();
    }
    res = await call(fresh);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    clearTokens();
    throw new AuthExpiredError();
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}
