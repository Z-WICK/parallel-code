const TOKEN_KEY = "parallel-code-token";
const REFRESH_TOKEN_KEY = "parallel-code-refresh-token";

/** Extract token from URL (hash/query) and persist to localStorage. */
export function initAuth(): string | null {
  const queryParams = new URLSearchParams(window.location.search);
  const hashRaw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hashRaw);
  const urlToken = hashParams.get("token") ?? queryParams.get("token");

  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken);

    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    hashParams.delete("token");
    url.hash = hashParams.toString();
    const cleanPath = `${url.pathname}${url.search}${url.hash ? `#${url.hash.slice(1)}` : ""}`;
    window.history.replaceState({}, "", cleanPath || "/");
    return urlToken;
  }

  return localStorage.getItem(TOKEN_KEY);
}

/** Get the stored token. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Replace token in localStorage (used for seamless token rotation). */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Get the stored refresh token. */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Replace refresh token in localStorage (used for seamless reconnect). */
export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

/** Clear stored token. */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Clear stored refresh token. */
export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Exchange refresh token for a fresh access token.
 * Returns true on success and updates localStorage tokens.
 */
export async function refreshAuthToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;

    const payload = (await response.json()) as {
      token?: string;
      refreshToken?: string;
      tokenExpiresAt?: number;
      url?: string;
      wifiUrl?: string | null;
      tailscaleUrl?: string | null;
    };
    if (!payload.token || !payload.refreshToken) return false;

    setToken(payload.token);
    setRefreshToken(payload.refreshToken);
    return true;
  } catch {
    return false;
  }
}

/** Build an authenticated URL for API requests. */
export function apiUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/** Build headers with auth token. */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
