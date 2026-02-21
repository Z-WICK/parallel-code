const TOKEN_KEY = "parallel-code-token";

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

/** Clear stored token. */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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
