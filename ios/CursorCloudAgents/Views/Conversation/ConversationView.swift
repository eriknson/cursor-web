import SwiftUI

struct ConversationView: View {
    let agent: Agent
    let apiClient: CursorAPIClientProtocol

    @State private var viewModel: ConversationViewModel

    init(agent: Agent, apiClient: CursorAPIClientProtocol) {
        self.agent = agent
        self.apiClient = apiClient
        _viewModel = State(initialValue: ConversationViewModel(apiClient: apiClient))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            MessageBubbleView(message: message)
                        }

                        if let pending = viewModel.pendingFollowUp {
                            MessageBubbleView(message: Message(id: "pending-\(pending)", type: .userMessage, text: pending))
                        }

                        if shouldShowThinking {
                            ThinkingIndicatorView(text: statusMessage)
                        }

                        if showSummary, let summary = viewModel.agent?.summary {
                            summaryView(summary)
                        }

                        Color.clear
                            .frame(height: 1)
                            .id("bottom")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: viewModel.messages.count) { _, _ in
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
                .onAppear {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }

            ComposerView(
                placeholder: "Add a task for Cursor to do",
                isLoading: viewModel.isSendingFollowUp,
                disabled: viewModel.agent == nil
            ) { text, _ in
                Task { await viewModel.sendFollowUp(text) }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Theme.bgMain)
        .navigationTitle(viewModel.agent?.name ?? agent.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.loadConversation(agentId: agent.id)
        }
        .onDisappear {
            viewModel.stopPolling()
        }
    }

    private var shouldShowThinking: Bool {
        viewModel.agent?.status.isActive == true
    }

    private var statusMessage: String {
        if viewModel.agent?.status == .creating {
            return "Setting up agent"
        }
        return "Working"
    }

    private var showSummary: Bool {
        viewModel.agent?.status.isTerminal == true && viewModel.agent?.summary != nil
    }

    private func summaryView(_ summary: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.bgTertiary)
                .frame(width: 28, height: 28)
                .overlay(
                    Image(systemName: "cube.transparent")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(Theme.textSecondary)
                )
                .padding(.top, 2)

            Text(summary)
                .font(.footnote)
                .foregroundStyle(Theme.textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.bgQuaternary)
                .clipShape(RoundedRectangle(cornerRadius: 16))

            Spacer()
        }
    }
}
