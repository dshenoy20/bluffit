/**
 * Sound manager.
 *
 * Drop mp3 files into public/sounds/ using the exact names below (see
 * public/sounds/README.md). Until a file exists, playing that sound is a
 * silent no-op — the game never breaks or logs errors for missing audio.
 *
 * The on/off preference persists per browser in localStorage and is exposed
 * through subscribe/isSoundEnabled so React components stay in sync.
 */

export type SoundKey =
  | "join" // a player joins the lobby
  | "roundStart" // a new question appears
  | "lockIn" // you submitted your bluff
  | "vote" // you cast your vote
  | "correct" // result: you found the real answer
  | "fooled" // result: you fell for a bluff
  | "bluffBonus" // result: players picked your bluff
  | "scoreboard" // leaderboard appears
  | "winner" // final screen + confetti
  | "tick"; // timer under 5 seconds

const SOUND_FILES: Record<SoundKey, string> = {
  join: "/sounds/join.mp3",
  roundStart: "/sounds/round-start.mp3",
  lockIn: "/sounds/lock-in.mp3",
  vote: "/sounds/vote.mp3",
  correct: "/sounds/correct.mp3",
  fooled: "/sounds/fooled.mp3",
  bluffBonus: "/sounds/bluff-bonus.mp3",
  scoreboard: "/sounds/scoreboard.mp3",
  winner: "/sounds/winner.mp3",
  tick: "/sounds/tick.mp3",
};

/** Per-sound volume (0-1). Tweak freely. */
const VOLUMES: Partial<Record<SoundKey, number>> = {
  tick: 0.35,
  join: 0.5,
};

const PREF_KEY = "bluffit:sound"; // "off" = muted; anything else = on

const listeners = new Set<() => void>();
const audioCache = new Map<SoundKey, HTMLAudioElement>();

export function isSoundEnabled(): boolean {
  try {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {}
  listeners.forEach((cb) => cb());
}

export function toggleSound(): void {
  setSoundEnabled(!isSoundEnabled());
}

/** For React's useSyncExternalStore. */
export function subscribeSound(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Play a sound (best effort). Silent no-op when muted, during SSR, when the
 * mp3 file hasn't been added yet, or when the browser blocks autoplay before
 * the first user interaction.
 */
export function playSound(key: SoundKey): void {
  try {
    if (typeof window === "undefined" || !isSoundEnabled()) return;
    let audio = audioCache.get(key);
    if (!audio) {
      audio = new Audio(SOUND_FILES[key]);
      audio.preload = "auto";
      audioCache.set(key, audio);
    }
    audio.currentTime = 0;
    audio.volume = VOLUMES[key] ?? 0.6;
    void audio.play().catch(() => {
      /* missing file or autoplay policy — fine */
    });
  } catch {
    /* audio must never break the game */
  }
}
