# BluffIt Analytics Reference

All analytics live in exactly two Firestore locations. There is no buffering
layer — every write goes straight to Firestore at the moment described below.
Failures are logged to the browser console with the `[bluffit-analytics]`
prefix (set `localStorage.setItem("bluffit:debug", "1")` to also log successes).

## Location 1: `stats/global` (single document)

| Field | Written when | Written by |
|---|---|---|
| `visitors` | First page load ever in a browser | Every player's browser (once) |
| `returningVisitors` | First page load of a browser's second-or-later visit | Once per browser |
| `sessions` | First page load of each tab-session | Once per tab-session |
| `returningSessions` | Same moment, if the browser has visited before | Once per tab-session |
| `countryCounts.{CC}` | With the first visit (locale/timezone estimate, `ZZ` = unknown) | Once per browser |
| `totalSessionDurationMs` | Every 60s while a tab is open, on tab hide/close | Each player's browser |
| `longestSessionMs` | Same flush (transactional max) | Each player's browser |
| `roomsCreated` | Room created | Host's browser |
| `themeCounts.{theme}` | Room created | Host's browser |
| `roundsCounts.{n}` | Room created | Host's browser |
| `gamesStarted` | Start Game / Play Again (inside the transition transaction) | Whichever client commits the transition |
| `gamesCompleted` | Final leaderboard reached (inside the transaction) | Whichever client commits the transition |
| `roomsCompleted` | First game in a room completes | Same |
| `backToBackGamesCompleted` | A rematch (game 2+) completes | Same |
| `maxConsecutiveGamesInARoom` | A game completes with a new record gameCount | Same |
| `totalGameDurationMs` | Game completes (now − gameStartedAt) | Same |
| `totalPlayersInCompletedGames` | Game completes | Same |
| `playAgainClicks` | Play Again pressed (inside the transaction) | Same |
| `gamesCreated` | LEGACY field from v1-v3 (was rooms created); no longer written | — |

Derived metrics (not stored): games abandoned = `gamesStarted − gamesCompleted`;
average players/room = `totalPlayersInCompletedGames / gamesCompleted`;
average game duration = `totalGameDurationMs / gamesCompleted`;
average session duration = `totalSessionDurationMs / sessions`.

## Location 2: `questionStats/{questionId}` (one document per question)

Document id = the question id (`h12`, `g40`, …; pre-themes rooms write `legacy_7`).
Written exactly once per round, immediately after the round is scored
(VOTING → REVEAL). The winning client computes the payload inside the scoring
transaction and writes it right after commit, so a `questionStats` permission
problem can never block gameplay.

| Field | Meaning |
|---|---|
| `timesPlayed` | Rounds this question appeared in |
| `totalVotes` | Votes cast across those rounds |
| `correctPicks` | Votes that found the real answer |
| `playersFooled` | Votes that picked a bluff |
| `pointsGenerated` | Total points the round produced |

Weak-question queries: high `correctPicks/totalVotes` = too easy; near-zero
`totalVotes` relative to `timesPlayed` = players time out (confusing/boring);
low `playersFooled` = hard to bluff against.

## What it looks like after ONE 5-round game (3 players, Random theme, one browser each)

`stats/global`:
```json
{
  "visitors": 3, "returningVisitors": 0,
  "sessions": 3, "returningSessions": 0,
  "countryCounts": { "IN": 3 },
  "totalSessionDurationMs": 1260000, "longestSessionMs": 430000,
  "roomsCreated": 1, "themeCounts": { "random": 1 }, "roundsCounts": { "5": 1 },
  "gamesStarted": 1, "gamesCompleted": 1, "roomsCompleted": 1,
  "backToBackGamesCompleted": 0, "maxConsecutiveGamesInARoom": 1,
  "playAgainClicks": 0,
  "totalGameDurationMs": 400000, "totalPlayersInCompletedGames": 3
}
```

`questionStats` — 5 documents (one per round), e.g. `questionStats/m41`:
```json
{ "timesPlayed": 1, "totalVotes": 3, "correctPicks": 1, "playersFooled": 2, "pointsGenerated": 2000 }
```

## Troubleshooting: "I see no data"

1. **Rules not published (most common).** Firestore console → Rules must contain
   the `stats/global` AND `questionStats/{questionId}` blocks from
   `firestore.rules`, and must be PUBLISHED. Symptom in console:
   `[bluffit-analytics] ... FirebaseError: Missing or insufficient permissions`.
2. **Anonymous Auth off or domain not authorized.** All writes require an
   anonymous session. Auth → Sign-in method → Anonymous = enabled; Auth →
   Settings → Authorized domains must include your Vercel domain.
3. **Looking in the wrong place.** `stats` is a collection with a single
   document `global`; `questionStats` only appears after the first round is
   scored on the new build.
4. Open the browser console and filter for `bluffit-analytics` — every failed
   write now says exactly what failed and why.
