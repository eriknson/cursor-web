import SwiftUI

struct ContentView: View {
    @Environment(AuthViewModel.self) private var authViewModel

    var body: some View {
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
        .task {
            await authViewModel.loadStoredKey()
        }
    }
}
