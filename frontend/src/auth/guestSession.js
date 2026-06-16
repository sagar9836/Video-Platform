const GUEST_SESSION_KEY = "guest_session_started_at";
export const GUEST_SESSION_LIMIT_MS = 30 * 60 * 1000;

export function getGuestSessionStartedAt() {
  const raw = localStorage.getItem(GUEST_SESSION_KEY);
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ensureGuestSession() {
  const existing = getGuestSessionStartedAt();
  if (existing) return existing;

  const now = Date.now();
  localStorage.setItem(GUEST_SESSION_KEY, String(now));
  return now;
}

export function clearGuestSession() {
  localStorage.removeItem(GUEST_SESSION_KEY);
}

export function getGuestSessionRemainingMs() {
  const startedAt = getGuestSessionStartedAt();
  if (!startedAt) return GUEST_SESSION_LIMIT_MS;

  return Math.max(0, GUEST_SESSION_LIMIT_MS - (Date.now() - startedAt));
}

export function isGuestSessionExpired() {
  return getGuestSessionRemainingMs() <= 0;
}
