import SwiftUI

@main
struct CursorCloudAgentsApp: App {
    @State private var authViewModel: AuthViewModel

    init() {
        let useMock = ProcessInfo.processInfo.environment["USE_MOCK_API"] == "1"
        let apiClient: CursorAPIClientProtocol = useMock ? MockCursorAPIClient() : CursorAPIClient()
        _authViewModel = State(initialValue: AuthViewModel(apiClient: apiClient))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authViewModel)
                .preferredColorScheme(.dark)
        }
    }
}
