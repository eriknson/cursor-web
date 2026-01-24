import SwiftUI

struct HomeView: View {
    @State private var viewModel: HomeViewModel
    let userInfo: UserInfo?
    let onLogout: () -> Void

    init(apiClient: CursorAPIClientProtocol, userInfo: UserInfo?, onLogout: @escaping () -> Void) {
        _viewModel = State(initialValue: HomeViewModel(apiClient: apiClient))
        self.userInfo = userInfo
        self.onLogout = onLogout
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                VStack(spacing: 16) {
                    header
                    searchBar
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 80)

                ComposerView(
                    placeholder: "Ask Cursor to build, plan, fix anything",
                    isLoading: viewModel.isLaunchingAgent,
                    disabled: viewModel.selectedRepository == nil && viewModel.repositories.isEmpty
                ) { prompt, model in
                    Task { await viewModel.launchAgent(prompt: prompt, model: model) }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
                .background(
                    LinearGradient(
                        colors: [Theme.bgMain.opacity(0.9), Theme.bgMain.opacity(0)],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                    .allowsHitTesting(false)
                )
            }
            .background(Theme.bgMain)
            .task { await viewModel.loadInitialData() }
            .navigationDestination(for: Agent.self) { agent in
                ConversationView(agent: agent, apiClient: viewModel.apiClient)
            }
        }
    }

    private var header: some View {
        HStack {
            RepoPickerView(
                repositories: viewModel.sortedRepositories,
                selectedRepository: $viewModel.selectedRepository,
                isLoading: viewModel.isLoadingRepos
            )
            Spacer()
            UserAvatarView(
                userEmail: userInfo?.userEmail,
                userName: userInfo?.apiKeyName,
                onLogout: onLogout
            )
        }
    }

    private var searchBar: some View {
        TextField("Search agents...", text: $viewModel.searchQuery)
            .textFieldStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Theme.bgCard)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Theme.borderSecondary, lineWidth: 1)
            )
            .foregroundStyle(Theme.textPrimary)
    }

    private var content: some View {
        AgentListView(
            groupedAgents: viewModel.groupedAgents,
            isLoading: viewModel.isLoadingAgents,
            errorMessage: viewModel.errorMessage,
            emptyMessage: emptyStateMessage
        ) {
            await viewModel.refreshAgents()
        }
    }

    private var emptyStateMessage: String {
        if !viewModel.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "No matching agents"
        }
        if let selected = viewModel.selectedRepository {
            return "No agents for \(selected.name)"
        }
        return "No agents yet"
    }
}
