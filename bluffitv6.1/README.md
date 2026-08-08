# BluffIt (MVP v0.1)

A real-time multiplayer party game. Players write believable fake answers to trivia questions, then try to spot the real answer. Built per the BluffIt MVP PRD.

Stack: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Firebase (Firestore + Anonymous Auth), deployable on Vercel.

## Setup

### 1. Firebase (one time, ~5 minutes)

1. Go to https://console.firebase.google.com and create a project (e.g. `bluffit`).
2. Build -> Authentication -> Get started -> enable **Anonymous** sign-in.
3. Build -> Firestore Database -> Create database -> Start in **production mode**.
4. In Firestore -> Rules, paste the contents of `firestore.rules` and publish.
5. Project settings -> General -> Your apps -> add a **Web app**. Copy the config values.
6. Copy `.env.local.example` to `.env.local` and fill in the six values.

### 2. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. To test multiplayer locally, open extra tabs in incognito/other browsers (anonymous auth gives each browser profile one identity).

### 3. Deploy to Vercel

1. Push this folder to a Git repo and import it at https://vercel.com/new (defaults are fine), or run `npx vercel`.
2. Add the six `NEXT_PUBLIC_FIREBASE_*` environment variables in Vercel -> Project -> Settings -> Environment Variables.
3. Deploy. In Firebase -> Authentication -> Settings -> Authorized domains, add your Vercel domain (e.g. `bluffit.vercel.app`).

### 4. Optional: automatic room cleanup

Rooms are treated as expired after 1 hour of inactivity (players can no longer use them), but the documents stay in Firestore. To physically delete them, set a Firestore TTL policy: Firestore -> TTL -> add policy on collection `rooms`, field `expiresAt` — or just leave them; stale rooms are unreachable and storage cost is negligible at MVP scale.

## Tests

```bash
npm test
```

Runs the pure game-logic tests (scoring, validation, ranking, voting options).

## Architecture notes (decisions beyond the PRD)

The PRD says "the server controls all state transitions," but the stack has no server — so transitions are **client-driven and self-healing**: phase deadlines are stored as timestamps on the room document; the host's client advances the phase when the timer expires (or when every connected player has acted, which ends phases early); every other client acts as a fallback a few seconds later. All transitions run as Firestore transactions with idempotency guards, so racing clients are harmless and a vanished host can never stall the game.

Other calls made where the PRD was silent:

- **Host migration** is computed, not written: the effective host is the original host if connected, otherwise the oldest connected player (by join time). Presence comes from a 20s heartbeat; a player is "disconnected" after 60s of silence.
- **Duplicate answers** are rejected at submit time (case/whitespace/punctuation-insensitive), including answers matching the real answer. The player is asked to write a different bluff.
- **Blank submissions** (timer expiry) are excluded from the voting screen.
- **Scoring** runs exactly once per round inside a transaction guarded by a `scoredKey`, so double-scoring is impossible. Votes reference the bluff author's player ID, not answer text.
- **Round results**: after voting, each player sees a personal result screen (correct / fooled by whom / no vote, plus a bluff bonus if others picked their fake answer) for ~3 seconds, then the game auto-advances to the leaderboard. The host makes exactly one click between rounds: Next Round.
- **Round isolation**: submissions and votes from listeners are tagged with the round they belong to, and phase-advance transactions independently verify that no connected player is still pending before an early advance — so one round's state can never leak into or skip the next.
- **Ties** share a rank; a tied final leaderboard shows all winners.
- **Names**: max 20 characters, must be unique per room (case-insensitive).
- **Join errors** are explicit: bad code, room full (8), game in progress, room expired.
- **Reconnection**: identity is the Firebase anonymous UID (persists per browser). Refreshing mid-game resumes automatically; the invite link doubles as the room URL.
- **Visitor counter** counts each browser once (localStorage guard) and is shown on the home screen; games created/completed are also tracked in `stats/global`.
- **Question database**: `data/questions/` holds 5 themed pools of 100 bluff-optimized questions each (history, movies & pop culture, sports, english, general) — 500 total, roughly 30% India-centric. The host picks a theme and round count (5/10/20/30) at room creation; each game (and each Play Again) randomly picks that many unique ids from the chosen pool ("Random" interleaves all five pools for a balanced mix) and stores them on the room doc as `questionIds`. To expand a pool, append to its JSON with a new unique id (keep the pool's prefix: h/m/s/e/g). The question's theme is never shown during gameplay. Legacy rooms with numeric ids fall back to `data/legacy-questions.json`.
- **Analytics** (`lib/analytics.ts` + increments inside game transactions): PII-free counters in `stats/global` (visitors, returning visitors, sessions, returning sessions, session duration total/longest, rooms created/completed, games started/completed, play-again clicks, back-to-back games, theme and round-count popularity, total players and duration of completed games for averages, coarse country estimate from browser locale/timezone) and per-question performance in `questionStats/{id}` (times played, total votes, correct picks, players fooled, points generated) written exactly once per round inside the scoring transaction. Games abandoned = gamesStarted − gamesCompleted (derived, not stored).

## Project structure

```
app/page.tsx            Home (create / join, visitor counter)
app/room/[code]/        Lobby + all game phases (invite link = room URL)
components/             UI building blocks and phase screens
lib/types.ts            Shared types and game constants
lib/gameLogic.ts        Pure logic: validation, shuffle, scoring, ranking
lib/roomService.ts      All Firestore reads/writes and phase transitions
lib/hooks.ts            Live room state, presence, self-healing phase driver
data/questions/         5 themed pools × 100 questions (host picks theme + rounds)
data/legacy-questions.json  Old 30-question pool (compatibility for live rooms)
lib/analytics.ts        PII-free visitor/session analytics
lib/sound.ts            Sound manager (mute toggle, per-event effects)
public/sounds/          Drop mp3 files here (see its README for names)
firestore.rules         Firestore security rules
tests/                  Game-logic tests (npm test)
```
