import Foundation

struct Repository: Identifiable, Codable, Hashable {
    var id: String { repository }
    let owner: String
    let name: String
    let repository: String
    let pushedAt: Date?
}
