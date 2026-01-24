import SwiftUI
import Observation

struct ContentView: View {
    @Environment(AuthViewModel.self) private var authViewModel

    var body: some View {
        @Bindable var authViewModel = authViewModel

        Group {
            if authViewModel.isAuthenticated {
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
