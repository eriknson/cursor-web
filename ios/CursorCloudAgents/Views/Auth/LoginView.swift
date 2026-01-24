import SwiftUI
import Observation

struct LoginView: View {
    @Bindable var viewModel: AuthViewModel

    var body: some View {
        VStack(spacing: 32) {
            VStack(spacing: 12) {
                CursorLoaderView(size: 64, loop: false)
                Text("Cursor Cloud Agents")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Theme.textPrimary)
            }

            VStack(alignment: .leading, spacing: 12) {
                SecureField("Enter Cursor API key", text: $viewModel.apiKeyInput)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .onSubmit {
                        Task { await viewModel.validateAndSaveKey() }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(Theme.bgCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Theme.borderSecondary, lineWidth: 1)
                    )
                    .foregroundStyle(Theme.textPrimary)

                if let errorMessage = viewModel.errorMessage {
                    ErrorView(message: errorMessage)
                }
            }

            Button {
                Task { await viewModel.validateAndSaveKey() }
            } label: {
                HStack(spacing: 10) {
                    if viewModel.isValidating {
                        CursorLoaderView(size: 16)
                        Text("Connecting")
                    } else {
                        Text("Continue")
                    }
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(viewModel.apiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Theme.bgTertiary : Theme.textPrimary)
                .foregroundStyle(viewModel.apiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Theme.textTertiary : Theme.textInverted)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(viewModel.apiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isValidating)

            VStack(spacing: 6) {
                Text("Get your API key from")
                    .font(.footnote)
                    .foregroundStyle(Theme.textQuaternary)
                Link("cursor.com/dashboard", destination: URL(string: "https://cursor.com/dashboard")!)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Theme.textSecondary)
                Text("Your key stays on this device.")
                    .font(.footnote)
                    .foregroundStyle(Theme.textQuaternary)
            }
        }
        .padding(24)
        .frame(maxWidth: 420)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bgMain)
    }
}
