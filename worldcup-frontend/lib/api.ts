export interface Session {
  token: string;
  mail: string;
  roles: string[];
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("jwt_token");
  const mail = localStorage.getItem("user_mail");
  const roles = localStorage.getItem("user_roles");
  if (!token || !mail) return null;
  return { token, mail, roles: roles ? JSON.parse(roles) : [] };
}

export function saveSession(session: Session) {
  localStorage.setItem("jwt_token", session.token);
  localStorage.setItem("user_mail", session.mail);
  localStorage.setItem("user_roles", JSON.stringify(session.roles));
  window.dispatchEvent(new Event("session-change"));
}

export function clearSession() {
  localStorage.removeItem("jwt_token");
  localStorage.removeItem("user_mail");
  localStorage.removeItem("user_roles");
  window.dispatchEvent(new Event("session-change"));
}

export function hasRole(session: Session | null, role: string) {
  return session?.roles.includes(role) ?? false;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || payload.title || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function money(value: number | string) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}
