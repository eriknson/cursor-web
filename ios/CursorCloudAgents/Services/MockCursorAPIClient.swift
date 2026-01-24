import Foundation
import Observation

@MainActor
@Observable
final class MockCursorAPIClient: CursorAPIClientProtocol {
    var apiKey: String?

    private var agents: [Agent]
    private var repositories: [Repository]
    private var conversations: [String: [Message]]

    init() {
        let now = Date()
        repositories = [
            Repository(owner: "anysphere", name: "cursor", repository: "github.com/anysphere/cursor", pushedAt: now.addingTimeInterval(-86_400)),
            Repository(owner: "anysphere", name: "everysphere", repository: "github.com/anysphere/everysphere", pushedAt: now.addingTimeInterval(-172_800)),
            Repository(owner: "cursor", name: "cloud-agents", repository: "github.com/cursor/cloud-agents", pushedAt: now.addingTimeInterval(-259_200)),
            Repository(owner: "cursor", name: "ios-playground", repository: "github.com/cursor/ios-playground", pushedAt: now.addingTimeInterval(-604_800))
        ]

        agents = [
            Agent(
                id: "agent-001",
                name: "Implement shared agent data model",
                status: .running,
                source: AgentSource(repository: "github.com/anysphere/everysphere", ref: "main"),
                target: AgentTarget(branchName: "cursor/agent-data-model", url: "https://cursor.com/run/agent-001", prUrl: nil, autoCreatePr: true),
                summary: nil,
                createdAt: now.addingTimeInterval(-1800),
                model: "Composer 1"
            ),
            Agent(
                id: "agent-002",
                name: "Refine chat bubble spacing",
                status: .finished,
                source: AgentSource(repository: "github.com/anysphere/cursor", ref: "main"),
                target: AgentTarget(branchName: "cursor/chat-bubbles", url: "https://cursor.com/run/agent-002", prUrl: "https://github.com/anysphere/cursor/pull/120", autoCreatePr: true),
                summary: "Adjusted spacing between message groups and aligned avatars with the first line of text.",
                createdAt: now.addingTimeInterval(-7200),
                model: "Composer 1"
            ),
            Agent(
                id: "agent-003",
                name: "Explore repository metadata",
                status: .finished,
                source: AgentSource(repository: "github.com/cursor/cloud-agents", ref: "main"),
                target: AgentTarget(branchName: "cursor/repo-metadata", url: "https://cursor.com/run/agent-003", prUrl: nil, autoCreatePr: false),
                summary: "Collected repository metadata and documented the latest schema.",
                createdAt: now.addingTimeInterval(-10800),
                model: "Opus 4.5"
            ),
            Agent(
                id: "agent-004",
                name: "Investigate rate limiting",
                status: .error,
                source: AgentSource(repository: "github.com/anysphere/everysphere", ref: "main"),
                target: AgentTarget(branchName: "cursor/rate-limits", url: "https://cursor.com/run/agent-004", prUrl: nil, autoCreatePr: false),
                summary: nil,
                createdAt: now.addingTimeInterval(-20000),
                model: "GPT-5.2"
            ),
            Agent(
                id: "agent-005",
                name: "Summarize recent agent activity",
                status: .stopped,
                source: AgentSource(repository: "github.com/cursor/ios-playground", ref: "main"),
                target: AgentTarget(branchName: "cursor/activity-summary", url: "https://cursor.com/run/agent-005", prUrl: nil, autoCreatePr: false),
                summary: nil,
                createdAt: now.addingTimeInterval(-25000),
                model: "Composer 1"
            )
        ]

        conversations = [
            "agent-001": [
                Message(id: "m1", type: .userMessage, text: "Can you model the agent metadata for iOS?"),
                Message(id: "m2", type: .assistantMessage, text: "Absolutely. I’m drafting structs for agents, sources, targets, and messages, plus a JSON decoder tuned for ISO 8601 dates.")
            ],
            "agent-002": [
                Message(id: "m3", type: .userMessage, text: "Tighten the message spacing in the chat view."),
                Message(id: "m4", type: .assistantMessage, text: "Updated the bubble spacing to match the Cursor web app and aligned avatars to the first line of text.")
            ],
            "agent-003": [
                Message(id: "m5", type: .userMessage, text: "Explore repo metadata structure."),
                Message(id: "m6", type: .assistantMessage, text: "Found repository metadata includes owner, name, repository URL, and pushedAt timestamp.")
            ],
            "agent-004": [
                Message(id: "m7", type: .userMessage, text: "Investigate rate limiting errors."),
                Message(id: "m8", type: .assistantMessage, text: "I hit a rate limit while fetching agent status; need to apply backoff or reduce polling.")
            ],
            "agent-005": [
                Message(id: "m9", type: .userMessage, text: "Summarize recent agent activity."),
                Message(id: "m10", type: .assistantMessage, text: "Agents have focused on UI polish, metadata cleanup, and rate limit investigations.")
            ]
        ]
    }

    func validateApiKey(_ key: String) async throws -> UserInfo {
        try await simulateDelay()
        guard !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw CursorAPIError.invalidApiKey
        }
        apiKey = key
        return UserInfo(apiKeyName: "Mock API Key", createdAt: Date().addingTimeInterval(-86400 * 30), userEmail: "designer@cursor.com")
    }

    func listRepositories() async throws -> [Repository] {
        try await simulateDelay()
        refreshAgentStatuses()
        return repositories
    }

    func listAgents(limit: Int) async throws -> [Agent] {
        try await simulateDelay()
        refreshAgentStatuses()
        return Array(agents.prefix(limit))
    }

    func getAgent(id: String) async throws -> Agent {
        try await simulateDelay()
        refreshAgentStatuses()
        guard let agent = agents.first(where: { $0.id == id }) else {
            throw CursorAPIError.notFound
        }
        return agent
    }

    func getConversation(agentId: String) async throws -> [Message] {
        try await simulateDelay()
        refreshAgentStatuses()
        return conversations[agentId] ?? []
    }

    func launchAgent(prompt: String, repository: String, model: String) async throws -> Agent {
        try await simulateDelay()
        let id = "agent-\(UUID().uuidString.prefix(6))"
        let agent = Agent(
            id: id,
            name: prompt,
            status: .running,
            source: AgentSource(repository: repository, ref: "main"),
            target: AgentTarget(branchName: "cursor/\(id)", url: "https://cursor.com/run/\(id)", prUrl: nil, autoCreatePr: true),
            summary: nil,
            createdAt: Date(),
            model: model
        )
        agents.insert(agent, at: 0)
        conversations[id] = [
            Message(id: UUID().uuidString, type: .userMessage, text: prompt)
        ]
        return agent
    }

    func addFollowUp(agentId: String, prompt: String) async throws {
        try await simulateDelay()
        let followUpMessage = Message(id: UUID().uuidString, type: .userMessage, text: prompt)
        let responseMessage = Message(id: UUID().uuidString, type: .assistantMessage, text: "Mock response: I’ll follow up on that task next.")

        var messages = conversations[agentId] ?? []
        messages.append(followUpMessage)
        messages.append(responseMessage)
        conversations[agentId] = messages
    }

    func stopAgent(id: String) async throws {
        try await simulateDelay()
        guard let index = agents.firstIndex(where: { $0.id == id }) else { return }
        let agent = agents[index]
        agents[index] = Agent(
            id: agent.id,
            name: agent.name,
            status: .stopped,
            source: agent.source,
            target: agent.target,
            summary: agent.summary,
            createdAt: agent.createdAt,
            model: agent.model
        )
    }

    func deleteAgent(id: String) async throws {
        try await simulateDelay()
        agents.removeAll { $0.id == id }
        conversations[id] = nil
    }

    private func simulateDelay() async throws {
        try await Task.sleep(nanoseconds: UInt64.random(in: 400_000_000...1_200_000_000))
    }

    private func refreshAgentStatuses() {
        let now = Date()
        for index in agents.indices {
            let agent = agents[index]
            guard agent.status == .running else { continue }
            if now.timeIntervalSince(agent.createdAt) > 90 {
                let summary = agent.summary ?? "Completed the task and prepared a summary of the updates."
                agents[index] = Agent(
                    id: agent.id,
                    name: agent.name,
                    status: .finished,
                    source: agent.source,
                    target: agent.target,
                    summary: summary,
                    createdAt: agent.createdAt,
                    model: agent.model
                )
            }
        }
    }
}
