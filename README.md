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

### Environment variables

Copy `.env.example` to `.env` (optional):

```
VITE_MOCK_CURSOR_API=true
VITE_MOCK_LATENCY_MS=200
```

Set `VITE_MOCK_CURSOR_API=false` to hit the real Cursor API (requires a valid key). Adjust mock latency to taste for demos.

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
