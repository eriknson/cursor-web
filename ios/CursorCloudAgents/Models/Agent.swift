import Foundation

enum AgentStatus: String, Codable {
    case creating = "CREATING"
    case running = "RUNNING"
    case finished = "FINISHED"
    case error = "ERROR"
    case expired = "EXPIRED"
    case stopped = "STOPPED"

    var isActive: Bool {
        self == .creating || self == .running
    }

    var isTerminal: Bool {
        !isActive
    }
}

struct Agent: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let status: AgentStatus
    let source: AgentSource
    let target: AgentTarget
    let summary: String?
    let createdAt: Date
    let model: String?
}

struct AgentSource: Codable, Hashable {
    let repository: String
    let ref: String
}

struct AgentTarget: Codable, Hashable {
    let branchName: String
    let url: String
    let prUrl: String?
    let autoCreatePr: Bool
}
