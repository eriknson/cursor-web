# Cursor Cloud

A web interface for launching and managing Cursor Cloud Agents.

## Features

- Launch cloud agents on any connected GitHub repository
- Real-time conversation view with agent progress
- Activity history with recent runs
- Model selection (composer-1, opus-4.5, gpt-5.2)

## Setup (Electron dev)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the Electron dev workflow (mock API enabled by default):
   ```bash
   npm run dev
   ```
   - Renderer runs on Vite at http://localhost:5173
   - Electron main/preload are built with esbuild (watch)
   - Electron app launches pointing to the dev server
   - Mock Cursor API is enabled via `VITE_MOCK_CURSOR_API=true` to let you exercise flows without a real key. Set `VITE_MOCK_CURSOR_API=false` to hit the real API (requires a valid key).

3. Build for production (renderer + main/preload):
   ```bash
   npm run build
   ```

4. Package (unsigned DMG target; requires macOS for actual DMG output):
   ```bash
   npm run package
   ```
   Cross-building mac targets is not supported on Linux; run on macOS for DMG generation.

5. Run built app locally (after `npm run build`):
   ```bash
   npm start
   ```

### Environment variables

Copy `.env.example` to `.env` (optional):

```
VITE_MOCK_CURSOR_API=true
VITE_MOCK_LATENCY_MS=200
```

Set `VITE_MOCK_CURSOR_API=false` to hit the real Cursor API (requires a valid key). Adjust mock latency to taste for demos.

### Packaging notes

- DMG packaging requires macOS and will use `dmg-license` (added as optional dependency). On Linux, `npm run package` will fail after build; use macOS to produce the DMG.

### Manual QA checklist (mock mode)

- Launch app via `npm run dev` (mock mode on by default); verify window opens and menu works.
- Enter any API key value; validation should succeed (mock user email shown).
- Repos list should show seeded repos; select one.
- Agents list should show seeded agents with varied statuses.
- Select an agent: conversation should display seeded messages; follow-ups add new messages.
- Launch new agent: prompt appears, new mock run is added, and conversation populates.
- Follow-up on running agent: new user/assistant messages appear; status remains RUNNING.
- Stop/delete agent: status updates or agent disappears as expected.
- Close/reopen app: window size/position restored; storage (API key, repo cache, last repo) persists.

### Known limitations

- DMG packaging is macOS-only (guarded by `scripts/ensure-mac.js`); Linux packaging will fail fast.
- SDK mode is disabled/stubbed; cloud mode only.
- Mock mode is default in dev; set `VITE_MOCK_CURSOR_API=false` to hit real API (requires valid key).

### Quick start (mock mode)

- `npm install`
- `npm run dev` (mock data, no real key needed)
- Enter any API key string to unlock UI; exercise repos/agents/follow-ups.

### Switch to real API

- Create `.env` with:
  ```
  VITE_MOCK_CURSOR_API=false
  ```
- Run `npm run dev` and enter your real Cursor API key.

### Reset local data

- Stored via `electron-store` in the userData directory (`cursor-desktop/config.json`):
  - macOS: `~/Library/Application Support/cursor-desktop/config.json`
  - Linux: `~/.config/cursor-desktop/config.json`
- Delete this file to clear API key, repo cache, last repo, and window state.

## Getting an API Key

Get your API key from [cursor.com/dashboard](https://cursor.com/dashboard). Your key is stored locally in your browser and never sent to any server other than Cursor's API.

## Notes

- SDK mode is disabled in this build (cloud-only). Follow-ups and continuation chains work in cloud mode; mock mode simulates agents and conversations.
- Window size/position/maximized state persists via `electron-store`.

## A Poem About Penguins

In icy realms where snowflakes dance,
The penguins waddle, take their chance.
With tuxedo coats of black and white,
They brave the cold both day and night.

They slide on bellies, dive so deep,
While fish and krill they hunt and keep.
In colonies they stand so tall,
Protecting young, one and all.

From Emperor to Little Blue,
These birds are loyal, strong, and true.
So here's to penguins, bold and grand,
The finest birds in all the land!
