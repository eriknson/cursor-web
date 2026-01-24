import Foundation
import Observation

@MainActor
@Observable
final class ConversationViewModel {
    var agent: Agent?
    var messages: [Message] = []
    var isLoading: Bool = false
    var errorMessage: String?
    var pendingFollowUp: String?
    var isSendingFollowUp: Bool = false

    private let apiClient: CursorAPIClientProtocol
    private var pollingTask: Task<Void, Never>?
    private var currentAgentId: String?

    init(apiClient: CursorAPIClientProtocol) {
        self.apiClient = apiClient
    }

    func loadConversation(agentId: String) async {
        if currentAgentId != agentId {
            currentAgentId = agentId
            messages = []
            errorMessage = nil
        }

        isLoading = true
        do {
            let agent = try await apiClient.getAgent(id: agentId)
            self.agent = agent
            let conversation = try await apiClient.getConversation(agentId: agentId)
            mergeMessages(conversation)
            isLoading = false

            if agent.status.isActive {
                startPolling()
            } else {
                stopPolling()
            }
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    func startPolling() {
        stopPolling()

        pollingTask = Task { [weak self] in
            guard let self else { return }
            var interval: UInt64 = 1_500_000_000
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: interval)
                await self.refresh()
                if self.agent?.status.isTerminal == true {
                    break
                }
                interval = self.errorMessage == nil ? 1_500_000_000 : 3_000_000_000
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    func refresh() async {
        guard let agentId = currentAgentId else { return }
        do {
            let agent = try await apiClient.getAgent(id: agentId)
            self.agent = agent
            let conversation = try await apiClient.getConversation(agentId: agentId)
            mergeMessages(conversation)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendFollowUp(_ text: String) async {
        guard let agentId = currentAgentId else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isSendingFollowUp = true
        pendingFollowUp = trimmed
        errorMessage = nil

        do {
            try await apiClient.addFollowUp(agentId: agentId, prompt: trimmed)
            pendingFollowUp = nil
            await refresh()
            if agent?.status.isActive == true {
                startPolling()
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isSendingFollowUp = false
    }

    private func mergeMessages(_ newMessages: [Message]) {
        let existingIds = Set(messages.map { $0.id })
        let appended = newMessages.filter { !existingIds.contains($0.id) }
        if messages.isEmpty {
            messages = newMessages
        } else if !appended.isEmpty {
            messages.append(contentsOf: appended)
        }
    }
}
