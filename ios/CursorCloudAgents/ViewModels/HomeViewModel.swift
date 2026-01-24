import Foundation
import Observation

@MainActor
@Observable
final class HomeViewModel {
    var agents: [Agent] = []
    var repositories: [Repository] = []
    var selectedRepository: Repository?
    var searchQuery: String = ""
    var isLoadingAgents: Bool = false
    var isLoadingRepos: Bool = false
    var isLaunchingAgent: Bool = false
    var errorMessage: String?

    let apiClient: CursorAPIClientProtocol

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
        repositories.sorted { lhs, rhs in
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
        await fetchRepositories()
        await fetchAgents()
    }

    func refreshAgents() async {
        await fetchAgents()
    }

    func selectRepository(_ repository: Repository?) {
        selectedRepository = repository
    }

    func launchAgent(prompt: String, model: String) async {
        guard let repository = selectedRepository ?? repositories.first else {
            errorMessage = "Select a repository to launch an agent."
            return
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
        } catch {
            errorMessage = error.localizedDescription
        }

        isLaunchingAgent = false
    }

    private func fetchRepositories() async {
        isLoadingRepos = true
        errorMessage = nil
        do {
            repositories = try await apiClient.listRepositories()
            if selectedRepository == nil {
                selectedRepository = repositories.first
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoadingRepos = false
    }

    private func fetchAgents() async {
        isLoadingAgents = true
        errorMessage = nil
        do {
            agents = try await apiClient.listAgents(limit: 50)
        } catch {
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
}
