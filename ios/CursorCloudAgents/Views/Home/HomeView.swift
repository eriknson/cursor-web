import SwiftUI
import Observation
#if canImport(UIKit)
import UIKit
#endif

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
                .contentShape(Rectangle())
                .simultaneousGesture(TapGesture().onEnded { hideKeyboard() })

                composer
            }
            .background(Theme.bgMain)
            .task { await viewModel.loadInitialData() }
            .navigationDestination(for: Agent.self) { agent in
                ConversationView(agent: agent, apiClient: viewModel.apiClient, onAuthFailure: onLogout)
            }
        }
    }

    private func hideKeyboard() {
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
    }

    private var header: some View {
        @Bindable var viewModel = viewModel

        let selectionBinding = Binding<Repository?>(
            get: { viewModel.selectedRepository },
            set: { viewModel.selectRepository($0) }
        )

        HStack {
            RepoPickerView(
                repositories: viewModel.sortedRepositories,
                selectedRepository: selectionBinding,
                isLoading: viewModel.isLoadingRepos,
                showAllOption: true
            )
            Spacer()
            if let email = userInfo?.userEmail {
                ViewThatFits(in: .horizontal) {
                    Text(email)
                        .font(.footnote)
                        .foregroundStyle(Theme.textTertiary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .accessibilityLabel("Signed in as \(email)")
                    EmptyView()
                }
            }
            UserAvatarView(
                userEmail: userInfo?.userEmail,
                userName: userInfo?.apiKeyName,
                onLogout: onLogout
            )
        }
    }

    private var searchBar: some View {
        @Bindable var viewModel = viewModel

        TextField("Search agents...", text: $viewModel.searchQuery)
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
            .onSubmit {
                hideKeyboard()
            }
    }

    private var content: some View {
        @Bindable var viewModel = viewModel

        AgentListView(
            groupedAgents: viewModel.groupedAgents,
            isLoading: viewModel.isLoadingAgents,
            errorMessage: viewModel.errorMessage,
            emptyMessage: emptyStateMessage
        ) {
            await viewModel.refreshAgents()
        }
    }

    private var composer: some View {
        @Bindable var viewModel = viewModel

        VStack(alignment: .leading, spacing: 6) {
            if viewModel.selectedRepository == nil {
                Text("Select a repository to launch an agent")
                    .font(.caption)
                    .foregroundStyle(Theme.textQuaternary)
                    .padding(.horizontal, 4)
                    .accessibilityLabel("Select a repository to launch an agent")
            }

            ComposerView(
                placeholder: "Ask Cursor to build, plan, fix anything",
                isLoading: viewModel.isLaunchingAgent,
                disabled: viewModel.selectedRepository == nil
            ) { prompt, model in
                Task {
                    if let agent = await viewModel.launchAgent(prompt: prompt, model: model) {
                        navigationPath.append(agent)
                    }
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
