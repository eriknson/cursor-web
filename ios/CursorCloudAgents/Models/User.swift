import Foundation

struct UserInfo: Codable, Hashable {
    let apiKeyName: String
    let createdAt: Date
    let userEmail: String
}
