/** Avatar metadata (plain TS so game logic and tests can import it without JSX). */

export interface AvatarInfo {
  key: string;
  label: string;
  bg: string; // background gradient stops
  bg2: string;
}

export const AVATARS: AvatarInfo[] = [
  { key: "cool", label: "The Cool One", bg: "#f59e0b", bg2: "#d97706" },
  { key: "nerd", label: "The Nerd", bg: "#38bdf8", bg2: "#0284c7" },
  { key: "detective", label: "The Detective", bg: "#a78bfa", bg2: "#7c3aed" },
  { key: "trickster", label: "The Trickster", bg: "#f472b6", bg2: "#db2777" },
  { key: "cowboy", label: "The Cowboy", bg: "#fb923c", bg2: "#ea580c" },
  { key: "chef", label: "The Chef", bg: "#34d399", bg2: "#059669" },
  { key: "ninja", label: "The Ninja", bg: "#64748b", bg2: "#334155" },
  { key: "wizard", label: "The Wizard", bg: "#818cf8", bg2: "#4f46e5" },
];

export function isAvatarKey(k: unknown): k is string {
  return typeof k === "string" && AVATARS.some((a) => a.key === k);
}
