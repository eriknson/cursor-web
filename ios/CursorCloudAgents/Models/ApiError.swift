import Foundation

enum CursorAPIError: Error, LocalizedError {
    case invalidApiKey
    case rateLimited(retryAfter: TimeInterval?)
    case notFound
    case malformedResponse
    case requestFailed(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidApiKey:
            return "Invalid or expired API key."
        case .rateLimited:
            return "Rate limited. Please wait and try again."
        case .notFound:
            return "The requested resource was not found."
        case .malformedResponse:
            return "Received an unexpected response from the server."
        case .requestFailed(let message):
            return message
        }
    }
}
