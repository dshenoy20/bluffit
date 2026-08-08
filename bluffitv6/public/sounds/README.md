# Soundtrack placeholders

Drop mp3 files into THIS folder with these exact names. Each one starts
playing automatically at the moment described — no code changes needed.
Any file you haven't added yet is simply silent.

| File | Plays when |
|---|---|
| `join.mp3` | A player joins the lobby |
| `round-start.mp3` | A new question appears (every round) |
| `lock-in.mp3` | You submit your bluff |
| `vote.mp3` | You cast your vote |
| `correct.mp3` | Result screen: you found the real answer |
| `fooled.mp3` | Result screen: you fell for someone's bluff |
| `bluff-bonus.mp3` | Result screen: players picked YOUR bluff |
| `scoreboard.mp3` | The round leaderboard appears |
| `winner.mp3` | The final screen with confetti |
| `tick.mp3` | Each second when a timer is under 5 seconds |

Tips:
- Keep effects short (0.3–1.5s); `winner.mp3` can be longer (2–4s).
- Per-sound volume is set in `lib/sound.ts` (`VOLUMES`).
- Users can mute everything with the speaker button (top-right); the
  preference is remembered per browser.
- Browsers block audio before the first tap/click on a page, so sounds may
  not play on the very first screen after a fresh page load — that is normal
  autoplay policy, not a bug.
