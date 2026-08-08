"use client";

import { useSyncExternalStore } from "react";
import { isSoundEnabled, subscribeSound, toggleSound } from "@/lib/sound";

/** Floating speaker button, present on every screen (rendered by <Page>). */
export function SoundToggle() {
  const enabled = useSyncExternalStore(subscribeSound, isSoundEnabled, () => true);
  return (
    <button
      type="button"
      onClick={toggleSound}
      title={enabled ? "Turn sound off" : "Turn sound on"}
      aria-label={enabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={enabled}
      className={`fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full
        ring-1 backdrop-blur-sm transition-all duration-200 active:scale-90 ${
          enabled
            ? "bg-white/10 text-amber-300 ring-white/15 hover:bg-white/15"
            : "bg-white/5 text-slate-500 ring-white/10 hover:text-slate-300"
        }`}
    >
      {enabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
    </button>
  );
}

function SpeakerOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      <line x1="16" y1="9" x2="22" y2="15" />
      <line x1="22" y1="9" x2="16" y2="15" />
    </svg>
  );
}
