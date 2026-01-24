# Cursor Cloud Agents (iOS)

Native SwiftUI client for the Cursor Cloud Agents experience. This app mirrors the web UX with API-key authentication, repository selection, agent history, and conversational follow-ups.

## Requirements
- Xcode 15+
- iOS 17+ simulator or device

## Running (Mock Data)
1. Open `ios/CursorCloudAgents.xcodeproj` in Xcode.
2. Set the environment variable `USE_MOCK_API=1` on the scheme.
3. Build and run on a simulator.

## Running (Live API)
1. Remove `USE_MOCK_API` from the scheme environment.
2. Build and run.
3. Enter your Cursor API key on the login screen.

## Notes
- The app uses a dark theme that matches the Cursor web UI.
- App icon assets are currently placeholders; add your own icons inside `Resources/Assets.xcassets/AppIcon.appiconset`.
- If you see empty conversations for new agents, wait a moment—the API may not have created the conversation yet.
