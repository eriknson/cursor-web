# Cursor Cloud

A web interface for launching and managing Cursor Cloud Agents.

## Features

- Launch cloud agents on any connected GitHub repository
- Real-time conversation view with agent progress
- Activity history with recent runs
- Model selection (composer-1, opus-4.5, gpt-5.2)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) and enter your Cursor API key.

## Mock API mode (no real credentials)

For local resilience testing without hitting the real Cursor API:

1. Enable mock mode:
   - Set `NEXT_PUBLIC_MOCK_API=true` (e.g., `cp .env.test .env.local` or prefix the dev command).
   - Start the dev server: `NEXT_PUBLIC_MOCK_API=true npm run dev`.
2. The app will display a “Mock API mode enabled” banner. All requests are served from an in-memory mock layer.
3. You can inject failure modes from the browser console:
   ```js
   // Rate limit once
   window.__cursorMock.setConfig({ mode: 'rate-limit', once: true, retryAfterMs: 1500 });
   // Simulate network error until reset
   window.__cursorMock.setConfig({ mode: 'network' });
   // Slow responses
   window.__cursorMock.setConfig({ mode: 'slow', latencyMs: 2000 });
   // Malformed JSON
   window.__cursorMock.setConfig({ mode: 'malformed', once: true });
   // Reset
   window.__cursorMock.resetConfig();
   ```
4. All flows (repo list, runs, launch, follow-up, conversation polling, SDK stream) route through the mock layer in this mode.

## Getting an API Key

Get your API key from [cursor.com/dashboard](https://cursor.com/dashboard). Your key is stored locally in your browser and never sent to any server other than Cursor's API.

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
