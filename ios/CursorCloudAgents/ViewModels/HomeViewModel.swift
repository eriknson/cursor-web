import Foundation
import Observation

@MainActor
@Observable
final class HomeViewModel {
    var agents: [Agent] = []
    var repositories: [Repository] = []
    var selectedRepository: Repository?
    var searchQuery: String = "" {
        didSet {
            if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                errorMessage = nil
            }
        }
    }
    var isLoadingAgents: Bool = false
    var isLoadingRepos: Bool = false
    var isLaunchingAgent: Bool = false
    var errorMessage: String?

    let apiClient: CursorAPIClientProtocol
    var onAuthFailure: (() -> Void)?
    private let lastSelectedRepoKey = "cursor.lastSelectedRepo"

    init(apiClient: CursorAPIClientProtocol) {
        self.apiClient = apiClient
    }

    var filteredAgents: [Agent] {
        var filtered = agents

        if let selectedRepository {
            filtered = filtered.filter { agentMatchesRepository(agent: $0, repository: selectedRepository) }
        }

        if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let query = searchQuery.lowercased()
            filtered = filtered.filter { agent in
                let name = agent.name.lowercased()
                let summary = (agent.summary ?? "").lowercased()
                let repo = agent.source.repository.lowercased()
                return name.contains(query) || summary.contains(query) || repo.contains(query)
            }
        }

        return filtered.sorted { $0.createdAt > $1.createdAt }
    }

    var groupedAgents: [(title: String, agents: [Agent])] {
        let grouped = Dictionary(grouping: filteredAgents) { agent in
            DateFormatters.dateGroupTitle(for: agent.createdAt)
        }

        let order = ["Today", "Yesterday", "Last 7 Days", "Older"]
        return order.compactMap { title in
            guard let agents = grouped[title], !agents.isEmpty else { return nil }
            return (title: title, agents: agents)
        }
    }

    var sortedRepositories: [Repository] {
        let lastUsedMap = repositoryLastUsedMap()
        return repositories.sorted { lhs, rhs in
            let lhsKey = normalizeRepoKey(lhs.repository)
            let rhsKey = normalizeRepoKey(rhs.repository)
            let lhsLastUsed = lastUsedMap[lhsKey] ?? .distantPast
            let rhsLastUsed = lastUsedMap[rhsKey] ?? .distantPast

            let lhsHasActivity = lhsLastUsed != .distantPast
            let rhsHasActivity = rhsLastUsed != .distantPast

            if lhsHasActivity != rhsHasActivity {
                return lhsHasActivity
            }

            if lhsLastUsed != rhsLastUsed {
                return lhsLastUsed > rhsLastUsed
            }

            switch (lhs.pushedAt, rhs.pushedAt) {
            case let (l?, r?):
                return l > r
            case (.some, .none):
                return true
            case (.none, .some):
                return false
            case (.none, .none):
                return lhs.name.lowercased() < rhs.name.lowercased()
            }
        }
    }

    func loadInitialData() async {
        errorMessage = nil
        async let repositoriesTask = fetchRepositories()
        async let agentsTask = fetchAgents()
        _ = await (repositoriesTask, agentsTask)

        if selectedRepository == nil {
            selectedRepository = sortedRepositories.first
        }
    }

    func refreshAgents() async {
        errorMessage = nil
        await fetchAgents()
    }

    func selectRepository(_ repository: Repository?) {
        selectedRepository = repository
        if let repository {
            UserDefaults.standard.set(repository.repository, forKey: lastSelectedRepoKey)
        } else {
            UserDefaults.standard.removeObject(forKey: lastSelectedRepoKey)
        }
    }

    func launchAgent(prompt: String, model: String) async -> Agent? {
        guard let repository = selectedRepository ?? repositories.first else {
            errorMessage = "Select a repository to launch an agent."
            return nil
        }

        isLaunchingAgent = true
        errorMessage = nil

        do {
            let agent = try await apiClient.launchAgent(
                prompt: prompt,
                repository: repository.repository,
                model: model
            )
            agents.insert(agent, at: 0)
            isLaunchingAgent = false
            return agent
        } catch {
            if handleAuthFailure(error) { return nil }
            errorMessage = error.localizedDescription
        }

        isLaunchingAgent = false
        return nil
    }

    private func fetchRepositories() async {
        isLoadingRepos = true
        do {
            repositories = try await apiClient.listRepositories()
            if selectedRepository == nil {
                if let stored = UserDefaults.standard.string(forKey: lastSelectedRepoKey),
                   let match = repositories.first(where: { $0.repository == stored }) {
                    selectedRepository = match
                } else {
                    selectedRepository = repositories.first
                }
            }
        } catch {
            if handleAuthFailure(error) { return }
            errorMessage = error.localizedDescription
        }
        isLoadingRepos = false
    }

    private func fetchAgents() async {
        isLoadingAgents = true
        do {
            agents = try await apiClient.listAgents(limit: 50)
        } catch {
            if handleAuthFailure(error) { return }
            errorMessage = error.localizedDescription
        }
        isLoadingAgents = false
    }

    private func agentMatchesRepository(agent: Agent, repository: Repository) -> Bool {
        let agentRepo = normalizeRepository(agent.source.repository)
        let selectedRepo = normalizeRepository(repository.repository)

        if agentRepo.full == selectedRepo.full { return true }
        if agentRepo.ownerAndName == selectedRepo.ownerAndName { return true }
        if agentRepo.name.count > 2 && agentRepo.name == selectedRepo.name { return true }
        if agentRepo.full.hasSuffix("/\(selectedRepo.name)") { return true }
        if selectedRepo.full.hasSuffix("/\(agentRepo.name)") { return true }

        return false
    }

    private func normalizeRepository(_ repository: String) -> (full: String, name: String, ownerAndName: String) {
        let normalized = repository.lowercased().trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        let parts = normalized.split(separator: "/").map(String.init)
        let name = parts.last ?? normalized
        var ownerAndName = name
        if parts.count >= 2 {
            let owner = parts[parts.count - 2]
            if owner != "github.com" {
                ownerAndName = "\(owner)/\(name)"
            }
        }
        return (normalized, name, ownerAndName)
    }

    private func repositoryLastUsedMap() -> [String: Date] {
        var map: [String: Date] = [:]
        for agent in agents {
            let key = normalizeRepoKey(agent.source.repository)
            let existing = map[key] ?? .distantPast
            if agent.createdAt > existing {
                map[key] = agent.createdAt
            }
        }
        return map
    }

    private func normalizeRepoKey(_ repository: String) -> String {
        let parts = repository.split(separator: "/").map(String.init)
        if parts.count >= 3, parts[0].contains("github") {
            return "\(parts[1])/\(parts[2])"
        }
        if parts.count >= 2 {
            return "\(parts[parts.count - 2])/\(parts.last ?? "")"
        }
        return repository
    }

    private func handleAuthFailure(_ error: Error) -> Bool {
        if let apiError = error as? CursorAPIError, case .invalidApiKey = apiError {
            onAuthFailure?()
            return true
        }
        return false
    }
}
