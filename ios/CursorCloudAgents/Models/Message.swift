import Foundation

enum MessageType: String, Codable {
    case userMessage = "user_message"
    case assistantMessage = "assistant_message"
}

struct Message: Identifiable, Codable, Hashable {
    let id: String
    let type: MessageType
    let text: String
}
