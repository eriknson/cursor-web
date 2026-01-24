import SwiftUI
import Observation

struct HomeView: View {
    @State private var viewModel: HomeViewModel
    @State private var navigationPath = NavigationPath()
    let userInfo: UserInfo?
    let onLogout: () -> Void

    init(apiClient: CursorAPIClientProtocol, userInfo: UserInfo?, onLogout: @escaping () -> Void) {
        let viewModel = HomeViewModel(apiClient: apiClient)
        viewModel.onAuthFailure = onLogout
        _viewModel = State(initialValue: viewModel)
        self.userInfo = userInfo
        self.onLogout = onLogout
    }

    var body: some View {
        @Bindable var viewModel = viewModel
        
        let header = HStack {
            RepoPickerView(
                repositories: viewModel.sortedRepositories,
                selectedRepository: $viewModel.selectedRepository,
                isLoading: viewModel.isLoadingRepos,
                showAllOption: false
            )
            Spacer()
            if let email = userInfo?.userEmail {
                Text(email)
                    .font(.footnote)
                    .foregroundStyle(Theme.textTertiary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            UserAvatarView(
                userEmail: userInfo?.userEmail,
                userName: userInfo?.apiKeyName,
                onLogout: onLogout
            )
        }

        let searchBar = TextField("Search agents...", text: $viewModel.searchQuery)
            .textFieldStyle(.plain)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Theme.bgCard)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Theme.borderSecondary, lineWidth: 1)
            )
            .foregroundStyle(Theme.textPrimary)
            .submitLabel(.search)

        let content = AgentListView(
            groupedAgents: viewModel.groupedAgents,
            isLoading: viewModel.isLoadingAgents,
            errorMessage: viewModel.errorMessage,
            emptyMessage: emptyStateMessage
        ) {
            await viewModel.refreshAgents()
        }

        return NavigationStack(path: $navigationPath) {
            ZStack(alignment: .bottom) {
                VStack(spacing: 16) {
                    header
                    searchBar
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 80)

                composer
            }
            .background(Theme.bgMain)
            .task { await viewModel.loadInitialData() }
            .navigationDestination(for: Agent.self) { agent in
                ConversationView(agent: agent, apiClient: viewModel.apiClient, onAuthFailure: onLogout)
            }
        }
    }

    private var composer: some View {
        ComposerView(
            placeholder: "Ask Cursor to build, plan, fix anything",
            isLoading: viewModel.isLaunchingAgent,
            disabled: viewModel.selectedRepository == nil && viewModel.repositories.isEmpty
        ) { prompt, model in
            Task {
                if let agent = await viewModel.launchAgent(prompt: prompt, model: model) {
                    navigationPath.append(agent)
                }
            }
        }
        .shadow(color: Theme.bgMain.opacity(0.4), radius: 20, x: 0, y: -4)
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        .safeAreaPadding(.bottom)
        .background(
            LinearGradient(
                colors: [Theme.bgMain.opacity(0.9), Theme.bgMain.opacity(0)],
                startPoint: .bottom,
                endPoint: .top
            )
            .allowsHitTesting(false)
        )
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
