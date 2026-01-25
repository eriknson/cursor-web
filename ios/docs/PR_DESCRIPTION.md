# Native iOS App for Cursor Cloud Agents

This PR introduces a native iOS application that replicates the functionality of the Cursor Cloud Agents web app. Built with SwiftUI targeting iOS 17+, the app provides a native mobile experience for managing and interacting with Cursor AI agents.

## 📱 Screenshots

### Login Screen
![Login Screen](mockups/ios-mockup-login.png)

The login screen features:
- Cursor branding with the iconic cube logo
- Secure API key input field
- Direct link to obtain API keys from cursor.com/dashboard
- Privacy note confirming keys stay on-device (stored in iOS Keychain)

### Home Screen
![Home Screen](mockups/ios-mockup-home.png)

The home screen provides:
- Repository picker for filtering agents by project
- Search bar for finding specific agents
- Agent list grouped by date (Today, Yesterday, Last 7 Days, Older)
- Status indicators (running, finished, error, etc.)
- Floating composer for launching new agents

### Conversation View
![Conversation View](mockups/ios-mockup-conversation.png)

The conversation view shows:
- Agent name and repository in the navigation bar
- Message thread with user prompts and assistant responses
- Real-time status updates with thinking indicators
- Typewriter animation for incoming assistant messages
- Summary display when agents complete
- Follow-up composer for continuing conversations

### Composer
![Composer](mockups/ios-mockup-composer.png)

The expandable composer includes:
- Multi-line text input (up to 1000 characters)
- Model picker (Composer 1, GPT-5.2, Opus 4.5)
- Character count indicator
- Haptic feedback on send

---

## ✨ Features

### Authentication
- **API Key Login**: Secure authentication using Cursor API keys
- **Keychain Storage**: Keys stored securely in iOS Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- **Session Persistence**: Automatically restores session on app launch
- **Graceful Logout**: Clear credentials and return to login

### Agent Management
- **List All Agents**: View agents across all repositories or filter by specific repo
- **Smart Grouping**: Agents grouped by date for easy navigation
- **Search**: Filter agents by name, summary, or repository
- **Pull to Refresh**: Native iOS refresh gesture support
- **Launch New Agents**: Create agents with custom prompts and model selection

### Conversation
- **Real-time Updates**: Polling for agent status and new messages
- **Message Display**: User and assistant messages with distinct styling
- **Typewriter Effect**: Animated text for the latest assistant response
- **Thinking Indicators**: Shimmer animation showing agent activity
- **Follow-up Messages**: Send additional prompts to running or finished agents
- **Copy Messages**: Long-press to copy message content
- **Text Selection**: Native text selection support for messages

### User Experience
- **Dark Theme**: Consistent with web app's dark mode (#14120B background)
- **Orange Accent**: Brand-consistent accent color (#F54E00)
- **No Purple**: Adheres to design rule - no purple gradients anywhere
- **Keyboard Handling**: Interactive keyboard dismissal, tap-to-dismiss
- **Safe Area Support**: Proper handling of notch and home indicator
- **Haptic Feedback**: Light haptic on message send

### Accessibility
- **VoiceOver Support**: Labels, hints, and values for all interactive elements
- **Dynamic Type**: Text scales with system font size
- **Accessibility Grouping**: Logical grouping of related elements

### Architecture
- **MVVM Pattern**: Clean separation with `@Observable` ViewModels
- **Protocol-Based API**: `CursorAPIClientProtocol` for easy mocking
- **Mock Data Layer**: Full mock implementation for development/testing
- **Concurrent Loading**: Parallel fetches for repositories and agents
- **Request Queue**: Rate-limiting actor to prevent API throttling

---

## 🏗️ Project Structure

```
ios/
├── CursorCloudAgents/
│   ├── App/
│   │   ├── CursorCloudAgentsApp.swift    # App entry point
│   │   └── ContentView.swift              # Root view with auth routing
│   ├── Models/
│   │   ├── Agent.swift                    # Agent and status types
│   │   ├── Message.swift                  # Conversation messages
│   │   ├── Repository.swift               # Repository model
│   │   └── User.swift                     # User info and API errors
│   ├── ViewModels/
│   │   ├── AuthViewModel.swift            # Authentication state
│   │   ├── HomeViewModel.swift            # Home screen logic
│   │   └── ConversationViewModel.swift    # Conversation management
│   ├── Views/
│   │   ├── Auth/LoginView.swift           # API key login
│   │   ├── Home/                          # Home screen components
│   │   ├── Conversation/                  # Chat view components
│   │   └── Components/                    # Reusable UI components
│   ├── Theme/Theme.swift                  # Color system
│   ├── Services/
│   │   ├── CursorAPIClient.swift          # Live API implementation
│   │   ├── MockCursorAPIClient.swift      # Mock for development
│   │   ├── KeychainService.swift          # Secure storage
│   │   └── RequestQueue.swift             # Rate limiting
│   └── Utilities/
│       ├── DateFormatters.swift           # Relative time formatting
│       └── Extensions.swift               # Color hex parsing
├── CursorCloudAgents.xcodeproj/           # Xcode project files
├── README.md                              # Setup overview
├── GETTING_STARTED.md                     # Device/simulator setup
└── docs/
    ├── mockups/                           # UI mockup images
    └── PR_DESCRIPTION.md                  # This file
```

---

## 🚀 Getting Started

### Requirements
- macOS with Xcode 15+
- iOS 17.0+ deployment target

### Setup
1. Clone the repository and checkout this branch
2. Open `ios/CursorCloudAgents.xcodeproj` in Xcode
3. Select your target device or simulator
4. Build and run (⌘R)
5. For full device and simulator instructions, see `ios/GETTING_STARTED.md`

### Mock Mode
The app includes a `MockCursorAPIClient` that provides:
- Sample agents in various states (running, finished, error)
- Multiple repositories
- Simulated conversations
- Realistic network delays

To use mock mode, set `USE_MOCK_API=1` in the Xcode scheme and launch the app. On the login screen, enter any non-empty key (for example, `mock-key`).

---

## 📋 User Flows

### First Launch
1. User opens app → Login screen displayed
2. User enters API key → "Continue" button validates key
3. Success → Home screen with agent list
4. Failure → Error message displayed inline

### Launching an Agent
1. User selects repository from picker (required)
2. User taps composer, enters prompt
3. User optionally selects model
4. User taps send → Agent created, navigates to conversation

### Viewing a Conversation
1. User taps agent row in list
2. Conversation loads with message history
3. If agent is running: polling starts, thinking indicator shown
4. When agent finishes: summary displayed, polling stops

### Sending Follow-up
1. User types in conversation composer
2. User taps send → Message appears as "pending" (dimmed)
3. Agent processes → Response appears with typewriter animation

---

## 🔧 Technical Details

### API Integration
The app uses the same API endpoints as the web app:
- `GET /me` - Validate API key
- `GET /repositories` - List repositories
- `GET /agents` - List agents
- `GET /agents/{id}` - Get agent status
- `GET /agents/{id}/conversation` - Get messages
- `POST /agents` - Launch agent
- `POST /agents/{id}/followup` - Send follow-up

### Polling Strategy
- Polls every 1.5 seconds while agent is active
- Stops when agent reaches terminal state
- Pauses when app enters background
- Resumes when app becomes active

### State Persistence
- API key: iOS Keychain
- Selected model: UserDefaults
- Selected repository: UserDefaults
- "All Repositories" selection: UserDefaults

---

## ⚠️ Known Limitations

1. **No Xcode on Linux**: The Xcode project was created programmatically; some manual Xcode configuration may be needed
2. **No Push Notifications**: Agent completion notifications not implemented
3. **No iPad Optimization**: UI is iPhone-focused (iPad works but not optimized)
4. **No Offline Mode**: Requires network connectivity

---

## 🧪 Testing

Since this environment lacks Xcode/iOS Simulator, testing requires:
1. A Mac with Xcode 15+
2. Clone branch and open project
3. Run on simulator or device
4. Use mock mode for development testing

---

## 📄 Files Changed

- **New**: `ios/` directory with complete SwiftUI application
- **Modified**: Root `README.md` with iOS app reference
