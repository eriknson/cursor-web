import Foundation

protocol CursorAPIClientProtocol {
    var apiKey: String? { get set }

    func validateApiKey(_ key: String) async throws -> UserInfo
    func listRepositories() async throws -> [Repository]
    func listAgents(limit: Int) async throws -> [Agent]
    func getAgent(id: String) async throws -> Agent
    func getConversation(agentId: String) async throws -> [Message]
    func launchAgent(prompt: String, repository: String, model: String) async throws -> Agent
    func addFollowUp(agentId: String, prompt: String) async throws
    func stopAgent(id: String) async throws
    func deleteAgent(id: String) async throws
}
