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

## Getting an API Key

Get your API key from [cursor.com/dashboard](https://cursor.com/dashboard). Your key is stored locally in your browser and never sent to any server other than Cursor's API.

## Environment Variables (Optional)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS_SECRET` | Bypass secret for protected Vercel preview deployments. Get it from Vercel Dashboard → Settings → Deployment Protection → Protection Bypass for Automation. |

## Native iOS App

The repository also includes a SwiftUI-based iOS client under `ios/`. See `ios/README.md` for setup and mock API instructions.
