type ApiFailure = {
  code?: string;
  error?: string;
  success: false;
};

type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
  success: true;
};

type ApiResponse<T> = ApiFailure | ApiSuccess<T>;

export const apiBaseUrl = import.meta.env.VITE_API_URL ?? "/api";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matchedCookie = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return matchedCookie ? decodeURIComponent(matchedCookie[1] ?? "") : null;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();

  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has("x-csrf-token")) {
    const csrfToken = readCookie("mikmok_csrf");

    if (csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  const errorMessage =
    payload && !payload.success ? payload.error ?? `Request failed with status ${response.status}.` : undefined;

  if (!response.ok || !payload || payload.success === false) {
    throw new Error(errorMessage ?? `Request failed with status ${response.status}.`);
  }

  return payload.data;
}
