import SwiftUI
import Observation
#if canImport(UIKit)
import UIKit
#endif
#if canImport(UIKit)
import UIKit
#endif

struct ConversationView: View {
    let agent: Agent
    let apiClient: CursorAPIClientProtocol
    let onAuthFailure: (() -> Void)?

    @State private var viewModel: ConversationViewModel
    @Environment(\.scenePhase) private var scenePhase

    init(agent: Agent, apiClient: CursorAPIClientProtocol, onAuthFailure: (() -> Void)? = nil) {
        self.agent = agent
        self.apiClient = apiClient
        let viewModel = ConversationViewModel(apiClient: apiClient)
        viewModel.onAuthFailure = onAuthFailure
        _viewModel = State(initialValue: viewModel)
        self.onAuthFailure = onAuthFailure
    }

    var body: some View {
        @Bindable var viewModel = viewModel

        GeometryReader { proxy in
            let bubbleWidth = proxy.size.width * 0.7

            VStack(spacing: 0) {
                ScrollViewReader { scrollProxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            if let errorMessage = viewModel.errorMessage {
                                ErrorView(message: errorMessage)
                            }

                            if let promptText = initialPromptText {
                                MessageBubbleView(
                                    message: Message(id: "prompt-\(promptText)", type: .userMessage, text: promptText),
                                    maxWidth: bubbleWidth
                                )
                            }

                            if showEmptyState {
                                Text("No messages yet")
                                    .font(.footnote)
                                    .foregroundStyle(Theme.textQuaternary)
                                    .padding(.horizontal, 4)
                            }

                            let lastAssistantId = viewModel.messages.last(where: { $0.type == .assistantMessage })?.id

                            ForEach(viewModel.messages) { message in
                                let shouldAnimate = viewModel.agent?.status.isActive == true && message.id == lastAssistantId
                                MessageBubbleView(
                                    message: message,
                                    maxWidth: bubbleWidth,
                                    animate: shouldAnimate
                                )
                            }

                            if let pending = viewModel.pendingFollowUp {
                                MessageBubbleView(
                                    message: Message(id: "pending-\(pending)", type: .userMessage, text: pending),
                                    maxWidth: bubbleWidth,
                                    isPending: true
                                )
                            }

                            if shouldShowThinking {
                                ThinkingIndicatorView(text: statusMessage, maxWidth: bubbleWidth)
                            }

                            if showSummary, let summary = viewModel.agent?.summary {
                                summaryView(summary, maxWidth: bubbleWidth)
                            }

                            Color.clear
                                .frame(height: 1)
                                .id("bottom")
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                    }
                    .scrollIndicators(.hidden)
                    .contentShape(Rectangle())
                    .simultaneousGesture(TapGesture().onEnded { hideKeyboard() })
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: viewModel.messages.count) { _, _ in
                        withAnimation(.easeOut(duration: 0.2)) {
                            scrollProxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                    .onChange(of: viewModel.pendingFollowUp) { _, _ in
                        withAnimation(.easeOut(duration: 0.2)) {
                            scrollProxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                    .onChange(of: viewModel.isLoading) { _, isLoading in
                        if !isLoading {
                            withAnimation(.easeOut(duration: 0.2)) {
                                scrollProxy.scrollTo("bottom", anchor: .bottom)
                            }
                        }
                    }
                    .onChange(of: viewModel.agent?.summary) { _, _ in
                        withAnimation(.easeOut(duration: 0.2)) {
                            scrollProxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                    .onAppear {
                        scrollProxy.scrollTo("bottom", anchor: .bottom)
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
                .safeAreaPadding(.bottom)
            }
        }
        .background(Theme.bgMain)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text(viewModel.agent?.name ?? agent.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)
                    if let repoName = repoDisplayName {
                        Text(repoName)
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                            .lineLimit(1)
                    }
                }
            }
        }
        .task {
            await viewModel.loadConversation(agentId: agent.id)
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active, viewModel.agent?.status.isActive == true {
                viewModel.startPolling()
            } else if newPhase != .active {
                viewModel.stopPolling()
            }
        }
        .onDisappear {
            viewModel.stopPolling()
        }
    }

    private func hideKeyboard() {
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
    }

    private var shouldShowThinking: Bool {
        viewModel.isLoading || viewModel.agent?.status.isActive == true
    }

    private var statusMessage: String {
        if viewModel.isLoading {
            return "Connecting"
        }
        if viewModel.agent?.status == .creating {
            return "Setting up agent"
        }
        return "Working"
    }

    private var initialPromptText: String? {
        guard viewModel.messages.first(where: { $0.type == .userMessage }) == nil else { return nil }
        guard !agent.name.isEmpty else { return nil }
        return agent.name
    }

    private var showSummary: Bool {
        viewModel.agent?.status.isTerminal == true && viewModel.agent?.summary != nil
    }

    private var showEmptyState: Bool {
        viewModel.messages.isEmpty && !shouldShowThinking && !showSummary
    }

    private var repoDisplayName: String? {
        let repository = viewModel.agent?.source.repository ?? agent.source.repository
        let parts = repository.split(separator: "/").map(String.init)
        if parts.count >= 3, parts[0].contains("github") {
            return "\(parts[1])/\(parts[2])"
        }
        if parts.count >= 2 {
            return "\(parts[parts.count - 2])/\(parts[parts.count - 1])"
        }
        return nil
    }

    private func summaryView(_ summary: String, maxWidth: CGFloat) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.bgTertiary)
                .frame(width: 28, height: 28)
                .overlay(
                    Image(systemName: "cube")
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
                .frame(maxWidth: maxWidth, alignment: .leading)

            Spacer()
        }
    }
}
