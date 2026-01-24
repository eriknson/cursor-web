import SwiftUI

struct ComposerView: View {
    var placeholder: String = "Ask Cursor to build, plan, fix anything"
    var isLoading: Bool = false
    var disabled: Bool = false
    var onSubmit: (String, String) -> Void

    @State private var text: String = ""
    @State private var selectedModel: String = modelOptions.first?.id ?? "composer-1"
    @FocusState private var isFocused: Bool

    private var isExpanded: Bool {
        isFocused || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 12) {
                TextField(placeholder, text: $text, axis: .vertical)
                    .font(.body)
                    .focused($isFocused)
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(isExpanded ? 4 : 1)
                    .disabled(disabled || isLoading)

                Button {
                    submit()
                } label: {
                    if isLoading {
                        CursorLoaderView(size: 16)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(isSendEnabled ? Theme.textInverted : Theme.textTertiary)
                    }
                }
                .disabled(!isSendEnabled)
                .frame(width: 32, height: 32)
                .background(isSendEnabled ? Theme.textPrimary : Theme.bgTertiary)
                .clipShape(Circle())
                .accessibilityLabel("Send message")
            }

            if isExpanded {
                HStack {
                    ModelPickerView(selectedModel: $selectedModel)
                    Spacer()
                }
            }
        }
        .padding(12)
        .background(Theme.bgCard)
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(isExpanded ? Theme.borderPrimary : Theme.borderTertiary, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private var isSendEnabled: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !disabled && !isLoading
    }

    private func submit() {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onSubmit(trimmed, selectedModel)
        text = ""
    }
}
