# VIRIDITE workflow

The playable preview is the judge. GitHub is where branches meet. Do not treat a zip, or a commit that was never played, as done.

## Rules

1. This preview stays the playable build. Camera, placement, and terrain are judged here, not from a zip.
2. One branch per system. One chat per branch. A chat stays out of files another branch owns.
3. Heavy is only for a hard pass (map art, unit readability, bot difficulty). It commits to that branch. It does not commit to `main`.
4. Merge one branch, then play it. Code that looks right still fails when a tank blends into the ground or a building drops off the cursor.
5. Push `main` after that playtest, not instead of it.

## Branches

| Branch | Owns | Does not touch |
| --- | --- | --- |
| `main` | The playable preview. Shared files below. | Other branches' files while they are open |
| `terrain` | `src/game/maps.ts`, `tileset.ts`, `palm-mask.ts`, `fourisles.ts`, `sat.ts` | Shared files, unit art, `ai.ts`, lobby UI |
| `units` | `src/game/art.ts`, `iso.ts`, `solids.ts`, `public/art/` | Shared files, maps, `ai.ts`, lobby UI |
| `ai` | `src/game/ai.ts` | Everything else |
| `ui` | `src/components/SkirmishLobby.tsx`, `Arsenal.tsx`, `SettingsSheet.tsx`, `AudioBuses.tsx`, `faction-style.ts` | `GameScreen.tsx` and the other shared files |

## Shared files

Only the playable-preview chat edits these. Other chats describe the change and stop.

- `src/components/GameScreen.tsx`
- `src/game/input.ts`
- `src/game/render.ts`
- `src/game/sim.ts`
- `src/game/view.ts`

`render.ts` and `sim.ts` are where the last two chats overwrote each other. That is why they stay here.

## How a pass lands

1. Work on your branch only.
2. Open a pull request into `main`. Do not merge it yourself.
3. The preview chat merges one PR, plays that system, then pushes `main`.
4. The next branch rebases onto the new `main` before more work.

## Heavy

Use Heavy only when the issue says "Heavy pass." Map art, unit readability, and bot difficulty qualify. Placement, camera, and HUD do not. Heavy still uses the branch, not `main`.
