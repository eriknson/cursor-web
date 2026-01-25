# Getting Started with Cursor Cloud Agents iOS App

This guide walks you through running the app on your iPhone or Mac.

---

## Prerequisites

- **macOS** 13.5+ (Ventura) or later
- **Xcode 15** or later ([Download from Mac App Store](https://apps.apple.com/app/xcode/id497799835))
- **Apple ID** (free account works for personal device testing)
- **Cursor API Key** ([Get one here](https://cursor.com/dashboard))

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/eriknson/cursor-web.git
cd cursor-web
git checkout cursor/native-ios-application-5afb
```

### 2. Open in Xcode

```bash
open ios/CursorCloudAgents.xcodeproj
```

Or manually:
1. Open Xcode
2. File → Open → Navigate to `ios/CursorCloudAgents.xcodeproj`

### 3. Configure Signing (First Time Only)

1. In Xcode, click on **CursorCloudAgents** in the project navigator (left sidebar)
2. Select the **CursorCloudAgents** target
3. Go to **Signing & Capabilities** tab
4. Check **Automatically manage signing**
5. Select your **Team** (your Apple ID)
   - If you don't see a team, click "Add Account..." and sign in with your Apple ID

### 4. Select Your Device

In Xcode's toolbar, click the device dropdown and choose:

**For iPhone:**
- Your connected iPhone (if plugged in via USB/USB-C)
- Or any iPhone simulator (e.g., "iPhone 15 Pro")

**For Mac:**
- "My Mac (Designed for iPhone)" - runs the iPhone app on your Mac (Apple Silicon only)

### 5. Build and Run

Press **⌘R** (Command + R) or click the ▶️ Play button.

---

## Running on iPhone (Physical Device)

### First-Time Device Setup

1. **Connect your iPhone** to your Mac via USB/USB-C cable
2. On your iPhone, tap **Trust** when prompted to trust this computer
3. In Xcode, your iPhone should appear in the device dropdown

### Developer Mode (iOS 16+)

If running iOS 16 or later, you need to enable Developer Mode:

1. On iPhone: **Settings → Privacy & Security → Developer Mode**
2. Toggle **Developer Mode** on
3. Restart your iPhone when prompted
4. After restart, confirm enabling Developer Mode

### Trust the Developer Certificate

The first time you run the app:

1. Build will succeed but app won't launch
2. On iPhone: **Settings → General → VPN & Device Management**
3. Tap your Apple ID under "Developer App"
4. Tap **Trust "[Your Apple ID]"**
5. Run the app again from Xcode (⌘R)

### Wireless Debugging (Optional)

After initial USB setup:

1. In Xcode: **Window → Devices and Simulators**
2. Select your iPhone
3. Check **Connect via network**
4. Your iPhone can now run/debug over WiFi (same network required)

---

## Running on Mac

### Option 1: Designed for iPhone (Recommended)

This runs the iPhone app directly on your Mac:

1. In device dropdown, select **"My Mac (Designed for iPhone)"**
2. Press ⌘R to build and run
3. The app opens in an iPhone-sized window

> Requires an Apple Silicon Mac. If you’re on Intel, use Mac Catalyst instead.

### Option 2: Mac Catalyst (If Enabled)

Mac Catalyst provides a more native Mac experience:

1. In Xcode, select the project → **CursorCloudAgents** target
2. Go to **General** tab
3. Under **Supported Destinations**, check **Mac (Mac Catalyst)**
4. Select **"My Mac"** in device dropdown
5. Press ⌘R

> Note: Mac Catalyst may require additional UI adjustments for optimal experience.

---

## Running on Simulator

Simulators are the easiest way to test without a physical device:

1. In device dropdown, select any simulator:
   - **iPhone 15 Pro** (recommended)
   - **iPhone 15**
   - **iPhone SE (3rd generation)** (smaller screen testing)
2. Press ⌘R
3. Simulator launches automatically

### Simulator Tips

- **Keyboard**: Press ⌘K to toggle software keyboard
- **Dark Mode**: Device → Appearance → Dark (already set as default)
- **Rotate**: ⌘← or ⌘→
- **Home**: ⌘⇧H
- **Screenshot**: ⌘S

---

## Recording a Demo Video

You can capture a screen recording to include in a PR or share with teammates.

### Record from the iOS Simulator

1. Build and run the app in the simulator
2. In the simulator menu bar, choose **File → Record Screen**
3. Interact with the app to show the main flows (login, home, conversation, composer)
4. Click the **Stop** button in the menu bar to finish
5. Save the `.mov` file when prompted

### Record from a Physical iPhone

**Option A: QuickTime (recommended for longer demos)**

1. Connect your iPhone via USB/USB‑C
2. Open **QuickTime Player**
3. Choose **File → New Movie Recording**
4. Click the ▼ next to the record button and select your iPhone as the camera
5. Press **Record** and walk through the app
6. Stop recording and save the `.mov` file

**Option B: iOS Screen Recording**

1. Open **Control Center** on your iPhone
2. Long‑press the **Screen Recording** button
3. Tap **Start Recording**
4. Record your walkthrough
5. Stop recording and find the video in Photos

---

## Using Mock Mode (No Real API Key Needed)

To test the app without a real Cursor API key:

1. In Xcode, go to **Product → Scheme → Edit Scheme...**
2. Select **Run** → **Arguments** tab
3. Under **Environment Variables**, add:
   - **Name**: `USE_MOCK_API`
   - **Value**: `1`
4. Build and run
5. On the login screen, enter any non-empty key (e.g., `mock-key`)

Mock mode provides:
- Sample agents in various states
- Simulated conversations
- Automatic agent completion after ~3 seconds
- No network required

---

## Using Live Mode (Real API)

1. Remove the `USE_MOCK_API` environment variable (or set it to `0`)
2. Build and run the app
3. On the login screen, enter your Cursor API key
4. Tap **Continue**

Get your API key at: https://cursor.com/dashboard

---

## Troubleshooting

### "Untrusted Developer" Error

On your iPhone:
1. Settings → General → VPN & Device Management
2. Tap your developer certificate
3. Tap "Trust"

### "Unable to install" Error

- Ensure Developer Mode is enabled (Settings → Privacy & Security → Developer Mode)
- Try restarting your iPhone
- Reconnect USB cable

### Build Errors

1. **Clean build**: ⌘⇧K (Product → Clean Build Folder)
2. **Rebuild**: ⌘B
3. Check that iOS Deployment Target is 17.0 or higher

### "No Team" in Signing

1. Xcode → Settings → Accounts
2. Click + to add your Apple ID
3. Return to project signing settings
4. Select your personal team

### Simulator Won't Launch

1. In Xcode: Window → Devices and Simulators
2. Delete any corrupted simulators
3. Create a new simulator or select a different one

### App Crashes on Launch

1. Check Console.app for crash logs
2. In Xcode: Window → Devices and Simulators → View Device Logs
3. Ensure you're running iOS 17.0 or later

---

## Project Structure Quick Reference

```
ios/CursorCloudAgents/
├── App/
│   ├── CursorCloudAgentsApp.swift  ← App entry point + mock/live toggle
│   └── ContentView.swift           ← Root view routing
├── Views/
│   ├── Auth/LoginView.swift        ← Login screen
│   ├── Home/HomeView.swift         ← Main agent list
│   └── Conversation/               ← Chat view
└── Services/
    ├── CursorAPIClient.swift       ← Live API
    └── MockCursorAPIClient.swift   ← Mock data
```

---

## Next Steps

Once running:

1. **Login**: Enter your Cursor API key (or use mock mode)
2. **Browse Agents**: View your existing agent runs
3. **Launch Agent**: Select a repo, type a prompt, tap send
4. **View Conversation**: Tap an agent to see the full thread
5. **Send Follow-up**: Add more instructions to a running agent

---

## Need Help?

- **Xcode Documentation**: Help → Xcode Help
- **Apple Developer Forums**: https://developer.apple.com/forums/
- **SwiftUI Tutorials**: https://developer.apple.com/tutorials/swiftui
