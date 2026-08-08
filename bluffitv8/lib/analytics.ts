/**
 * Lightweight, PII-free analytics.
 *
 * Everything aggregates into two places:
 *   stats/global          — one document of counters (visitors, sessions, rooms, games)
 *   questionStats/{id}    — one document per question (performance counters)
 *
 * No names, no uids, no GPS. Country is a coarse estimate from the browser
 * locale / timezone. Analytics writes are best-effort — they must never break
 * or slow down the game — but every failure is LOGGED to the console with the
 * [bluffit-analytics] prefix so problems are visible instead of silent.
 */

import { doc, increment, runTransaction, setDoc } from "firebase/firestore";
import { ensureSignedIn, getDb } from "./firebase";

const statsRef = () => doc(getDb(), "stats", "global");

const K_VISITED = "bluffit:visited"; // set once per browser
const K_RETURN_COUNTED = "bluffit:returning-counted"; // once per browser
const K_SESSION = "bluffit:session-counted"; // once per tab-session
const K_SESSION_START = "bluffit:session-start";
const K_LAST_FLUSH = "bluffit:session-flushed-at";

const FLUSH_INTERVAL_MS = 60_000;

/* ---------- logging ---------- */

/**
 * Every analytics failure goes through here. Open the browser console and
 * filter for "bluffit-analytics" to see exactly which writes are failing and
 * why (the most common cause: firestore.rules not published, which surfaces
 * as FirebaseError: PERMISSION_DENIED).
 */
export function logAnalyticsError(context: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[bluffit-analytics] ${context} failed:`, err);
}

function logDebug(context: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("bluffit:debug")) {
      // eslint-disable-next-line no-console
      console.info(`[bluffit-analytics] ${context} ok`);
    }
  } catch {}
}

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

let sessionWriteInFlight = false;

/**
 * Call once per page load (mounted in the root layout). Counts:
 * - visitors / returningVisitors (once per browser)
 * - sessions / returningSessions (once per tab-session)
 * - countryCounts (once per browser)
 * and starts the session-duration clock.
 *
 * Local flags are only set AFTER the Firestore write succeeds, so a failed
 * write (offline, auth race, rules) is retried on the next page load instead
 * of permanently uncounting the browser.
 */
export async function initSessionTracking(): Promise<void> {
  if (typeof window === "undefined") return;
  let ls: Storage, ss: Storage;
  try {
    ls = window.localStorage;
    ss = window.sessionStorage;
    if (!ss.getItem(K_SESSION_START)) {
      ss.setItem(K_SESSION_START, String(Date.now()));
      ss.setItem(K_LAST_FLUSH, String(Date.now()));
    }
    if (ss.getItem(K_SESSION)) return; // this session already counted
    if (sessionWriteInFlight) return;
    sessionWriteInFlight = true;
  } catch (err) {
    logAnalyticsError("session-tracking (storage unavailable)", err);
    return;
  }

  const isReturningVisitor = !!ls.getItem(K_VISITED);
  const firstVisit = !isReturningVisitor;
  const countReturning = isReturningVisitor && !ls.getItem(K_RETURN_COUNTED);

  try {
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
    // Mark as counted only now that the write is confirmed.
    ss.setItem(K_SESSION, "1");
    if (firstVisit) ls.setItem(K_VISITED, "1");
    if (countReturning) ls.setItem(K_RETURN_COUNTED, "1");
    logDebug("session+visitor counters");
  } catch (err) {
    logAnalyticsError("session/visitor counters (stats/global)", err);
  } finally {
    sessionWriteInFlight = false;
  }
}

/**
 * Flush the time elapsed since the last flush into total/longest session
 * duration. Called every 60s while the tab is open, on visibility loss, and
 * on page hide — so at most ~60s of session time can be lost on a hard kill.
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
    logDebug(`session duration +${Math.round(delta / 1000)}s`);
  } catch (err) {
    logAnalyticsError("session duration flush", err);
  }
}

/** Wire duration flushing to page lifecycle + a periodic timer. Returns a cleanup function. */
export function attachSessionLifecycle(): () => void {
  if (typeof window === "undefined") return () => {};
  const onHidden = () => {
    if (document.visibilityState === "hidden") void flushSessionDuration();
  };
  const onHide = () => void flushSessionDuration();
  const timer = setInterval(() => void flushSessionDuration(), FLUSH_INTERVAL_MS);
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", onHide);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onHide);
  };
}
