import Foundation

final class CursorAPIClient: CursorAPIClientProtocol {
    var apiKey: String?

    private let baseURL = URL(string: "https://api.cursor.com/v0")!
    private let session: URLSession
    private let requestQueue = RequestQueue()

    init(apiKey: String? = nil, session: URLSession = .shared) {
        self.apiKey = apiKey
        self.session = session
    }

    func validateApiKey(_ key: String) async throws -> UserInfo {
        try await requestQueue.enqueue {
            try await self.request(path: "/me", method: "GET", apiKey: key)
        }
    }

    func listRepositories() async throws -> [Repository] {
        try await requestQueue.enqueue {
            let response: RepositoryListResponse = try await self.request(path: "/repositories", method: "GET")
            return response.repositories
        }
    }

    func listAgents(limit: Int) async throws -> [Agent] {
        try await requestQueue.enqueue {
            let response: AgentListResponse = try await self.request(path: "/agents?limit=\(limit)", method: "GET")
            return response.agents
        }
    }

    func getAgent(id: String) async throws -> Agent {
        try await requestQueue.enqueue {
            try await self.request(path: "/agents/\(id)", method: "GET")
        }
    }

    func getConversation(agentId: String) async throws -> [Message] {
        try await requestQueue.enqueue {
            let response: ConversationResponse = try await self.request(path: "/agents/\(agentId)/conversation", method: "GET")
            return response.messages
        }
    }

    func launchAgent(prompt: String, repository: String, model: String) async throws -> Agent {
        let payload = LaunchAgentPayload(
            prompt: Prompt(text: prompt),
            source: AgentSourcePayload(repository: repository),
            target: AgentTargetPayload(autoCreatePr: true),
            model: model
        )

        return try await requestQueue.enqueue {
            try await self.request(path: "/agents", method: "POST", body: payload)
        }
    }

    func addFollowUp(agentId: String, prompt: String) async throws {
        let payload = FollowUpPayload(prompt: Prompt(text: prompt))
        _ = try await requestQueue.enqueue {
            try await self.request(path: "/agents/\(agentId)/followup", method: "POST", body: payload) as EmptyResponse
        }
    }

    func stopAgent(id: String) async throws {
        _ = try await requestQueue.enqueue {
            try await self.request(path: "/agents/\(id)/stop", method: "POST") as EmptyResponse
        }
    }

    func deleteAgent(id: String) async throws {
        _ = try await requestQueue.enqueue {
            try await self.request(path: "/agents/\(id)", method: "DELETE") as EmptyResponse
        }
    }
}

private extension CursorAPIClient {
    struct RepositoryListResponse: Decodable {
        let repositories: [Repository]
    }

    struct AgentListResponse: Decodable {
        let agents: [Agent]
    }

    struct ConversationResponse: Decodable {
        let messages: [Message]
    }

    struct EmptyResponse: Decodable {}

    struct Prompt: Encodable {
        let text: String
    }

    struct AgentSourcePayload: Encodable {
        let repository: String
    }

    struct AgentTargetPayload: Encodable {
        let autoCreatePr: Bool
    }

    struct LaunchAgentPayload: Encodable {
        let prompt: Prompt
        let source: AgentSourcePayload
        let target: AgentTargetPayload
        let model: String
    }

    struct FollowUpPayload: Encodable {
        let prompt: Prompt
    }

    func request<T: Decodable>(
        path: String,
        method: String,
        apiKey: String? = nil,
        body: Encodable? = nil
    ) async throws -> T {
        let apiKeyToUse = apiKey ?? self.apiKey
        guard let apiKeyToUse else {
            throw CursorAPIError.invalidApiKey
        }

        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw CursorAPIError.requestFailed(message: "Invalid request URL.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let credentials = "\(apiKeyToUse):"
        let encoded = Data(credentials.utf8).base64EncodedString()
        request.setValue("Basic \(encoded)", forHTTPHeaderField: "Authorization")

        if let body = body {
            let encoder = JSONEncoder()
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CursorAPIError.requestFailed(message: "Invalid server response.")
        }

        switch httpResponse.statusCode {
        case 200...299:
            break
        case 401, 403:
            throw CursorAPIError.invalidApiKey
        case 404, 409:
            throw CursorAPIError.notFound
        case 429:
            let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After").flatMap { TimeInterval($0) }
            throw CursorAPIError.rateLimited(retryAfter: retryAfter)
        default:
            let message = String(data: data, encoding: .utf8) ?? "Request failed (\(httpResponse.statusCode))."
            throw CursorAPIError.requestFailed(message: message)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = ISO8601DateFormatter.cursorAPIDate.date(from: value) ?? ISO8601DateFormatter.cursorAPIDateNoFraction.date(from: value) {
                return date
            }
            throw CursorAPIError.malformedResponse
        }

        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw CursorAPIError.malformedResponse
        }
    }
}

private struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init(_ wrapped: Encodable) {
        self.encodeClosure = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}

private extension ISO8601DateFormatter {
    static let cursorAPIDate: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let cursorAPIDateNoFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
