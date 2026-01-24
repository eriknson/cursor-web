import Foundation
import Observation

@MainActor
@Observable
final class AuthViewModel {
    var apiKeyInput: String = ""
    var isValidating: Bool = false
    var errorMessage: String?
    var userInfo: UserInfo?
    var isAuthenticated: Bool = false

    var apiClient: CursorAPIClientProtocol
    private let keychain: KeychainService

    init(apiClient: CursorAPIClientProtocol, keychain: KeychainService = .shared) {
        self.apiClient = apiClient
        self.keychain = keychain
    }

    func loadStoredKey() async {
        guard let storedKey = await keychain.getApiKey() else { return }
        await validateAndSaveKey(storedKey)
    }

    func validateAndSaveKey() async {
        let trimmed = apiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await validateAndSaveKey(trimmed)
    }

    func logout() async {
        isAuthenticated = false
        userInfo = nil
        apiKeyInput = ""
        errorMessage = nil
        apiClient.apiKey = nil
        do {
            try await keychain.deleteApiKey()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func validateAndSaveKey(_ key: String) async {
        isValidating = true
        errorMessage = nil

        do {
            let info = try await apiClient.validateApiKey(key)
            apiClient.apiKey = key
            userInfo = info
            isAuthenticated = true
            apiKeyInput = ""
            try await keychain.saveApiKey(key)
        } catch {
            errorMessage = error.localizedDescription
        }

        isValidating = false
    }
}
