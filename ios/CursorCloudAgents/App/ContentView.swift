import SwiftUI
import Observation

struct ContentView: View {
    @Environment(AuthViewModel.self) private var authViewModel

    var body: some View {
        @Bindable var authViewModel = authViewModel

        Group {
            if authViewModel.isInitializing {
                VStack(spacing: 16) {
                    CursorLoaderView(size: 48)
                    Text("Loading")
                        .font(.footnote)
                        .foregroundStyle(Theme.textTertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.bgMain)
            } else if authViewModel.isAuthenticated {
                HomeView(
                    apiClient: authViewModel.apiClient,
                    userInfo: authViewModel.userInfo,
                    onLogout: { Task { await authViewModel.logout() } }
                )
            } else {
                LoginView(viewModel: authViewModel)
            }
        }
        .tint(Theme.accent)
        .task {
            await authViewModel.loadStoredKey()
        }
    }
}
