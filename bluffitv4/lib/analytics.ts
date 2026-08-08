/**
 * Lightweight, PII-free analytics.
 *
 * Everything aggregates into two places:
 *   stats/global          — counters for visitors, sessions, rooms, games
 *   questionStats/{id}    — per-question performance (written in roomService)
 *
 * No names, no uids, no GPS. Country is a coarse estimate from the browser
 * locale / timezone. Every write is best-effort: analytics must never break
 * or slow down the game, so all failures are swallowed.
 */

import { doc, increment, runTransaction, setDoc } from "firebase/firestore";
import { ensureSignedIn, getDb } from "./firebase";

const statsRef = () => doc(getDb(), "stats", "global");

const K_VISITED = "bluffit:visited"; // set once per browser (existing key)
const K_RETURN_COUNTED = "bluffit:returning-counted"; // once per browser
const K_SESSION = "bluffit:session-counted"; // once per tab-session
const K_SESSION_START = "bluffit:session-start";
const K_LAST_FLUSH = "bluffit:session-flushed-at";

/* ---------- country estimate (coarse, no PII) ---------- */

const TZ_TO_COUNTRY: Record<string, string> = {
  "Asia/Calcutta": "IN", "Asia/Kolkata": "IN",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Phoenix": "US",
  "Europe/London": "GB", "Europe/Paris": "FR", "Europe/Berlin": "DE",
  "Asia/Dubai": "AE", "Asia/Singapore": "SG", "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU",
  "America/Toronto": "CA", "America/Vancouver": "CA",
  "Asia/Tokyo": "JP", "Asia/Shanghai": "CN", "Asia/Seoul": "KR",
  "Europe/Amsterdam": "NL", "Europe/Madrid": "ES", "Europe/Rome": "IT",
  "America/Sao_Paulo": "BR", "Africa/Lagos": "NG", "Africa/Johannesburg": "ZA",
};

export function estimateCountry(): string {
  try {
    // 1) Locale region: "en-IN" -> IN (most direct signal)
    for (const lang of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(lang).region;
      if (region && /^[A-Z]{2}$/.test(region)) return region;
    }
  } catch {}
  try {
    // 2) Timezone lookup
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_TO_COUNTRY[tz]) return TZ_TO_COUNTRY[tz];
  } catch {}
  return "ZZ"; // unknown
}

/* ---------- visitor + session tracking ---------- */

/**
 * Call once per page load (home screen). Counts:
 * - visitors / returningVisitors (once per browser)
 * - sessions / returningSessions (once per tab-session)
 * - countryCounts (once per browser)
 * and starts the session-duration clock.
 */
export async function initSessionTracking(): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const ls = window.localStorage;
    const ss = window.sessionStorage;

    if (!ss.getItem(K_SESSION_START)) {
      ss.setItem(K_SESSION_START, String(Date.now()));
      ss.setItem(K_LAST_FLUSH, String(Date.now()));
    }
    if (ss.getItem(K_SESSION)) return; // this session already counted
    ss.setItem(K_SESSION, "1");

    const isReturningVisitor = !!ls.getItem(K_VISITED);
    const firstVisit = !isReturningVisitor;
    const countReturning = isReturningVisitor && !ls.getItem(K_RETURN_COUNTED);
    if (firstVisit) ls.setItem(K_VISITED, "1");
    if (countReturning) ls.setItem(K_RETURN_COUNTED, "1");

    await ensureSignedIn();
    await setDoc(
      statsRef(),
      {
        sessions: increment(1),
        ...(isReturningVisitor ? { returningSessions: increment(1) } : {}),
        ...(firstVisit
          ? {
              visitors: increment(1),
              countryCounts: { [estimateCountry()]: increment(1) },
            }
          : {}),
        ...(countReturning ? { returningVisitors: increment(1) } : {}),
      },
      { merge: true }
    );
  } catch {
    /* analytics must never break the app */
  }
}

/**
 * Flush the time elapsed since the last flush into total/longest session
 * duration. Called on visibility loss and page hide (best effort).
 */
export async function flushSessionDuration(): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const ss = window.sessionStorage;
    const start = Number(ss.getItem(K_SESSION_START) ?? 0);
    const lastFlush = Number(ss.getItem(K_LAST_FLUSH) ?? 0);
    if (!start || !lastFlush) return;
    const now = Date.now();
    const delta = now - lastFlush;
    if (delta < 1000) return; // nothing meaningful to record
    ss.setItem(K_LAST_FLUSH, String(now));
    const sessionSoFar = now - start;

    await setDoc(
      statsRef(),
      { totalSessionDurationMs: increment(delta) },
      { merge: true }
    );
    // Longest session: transactional max, best effort.
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(statsRef());
      const longest = (snap.data()?.longestSessionMs as number) ?? 0;
      if (sessionSoFar > longest) {
        tx.set(statsRef(), { longestSessionMs: sessionSoFar }, { merge: true });
      }
    });
  } catch {
    /* best effort only */
  }
}

/** Wire duration flushing to page lifecycle. Returns a cleanup function. */
export function attachSessionLifecycle(): () => void {
  if (typeof window === "undefined") return () => {};
  const onHidden = () => {
    if (document.visibilityState === "hidden") void flushSessionDuration();
  };
  const onHide = () => void flushSessionDuration();
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", onHide);
  return () => {
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onHide);
  };
}
