import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct ComposerView: View {
    var placeholder: String = "Ask Cursor to build, plan, fix anything"
    var isLoading: Bool = false
    var disabled: Bool = false
    var onSubmit: (String, String) -> Void

    @State private var text: String = ""
    @AppStorage("cursor.selectedModel") private var selectedModel: String = modelOptions.first?.id ?? "composer-1"
    @FocusState private var isFocused: Bool
    private let maxLength = 1000

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
                    .textInputAutocapitalization(.sentences)
                    .autocorrectionDisabled()
                    .lineLimit(isExpanded ? 4 : 1)
                    .submitLabel(.send)
                    .onSubmit {
                        submit()
                    }
                    .disabled(disabled || isLoading)
                    .onChange(of: text) { _, newValue in
                        if newValue.count > maxLength {
                            text = String(newValue.prefix(maxLength))
                        }
                    }

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
                .accessibilityHint("Sends the current prompt")
            }

            if isExpanded {
                HStack {
                    ModelPickerView(selectedModel: $selectedModel)
                    Spacer()
                    Text("\(trimmedText.count) / \(maxLength)")
                        .font(.caption)
                        .foregroundStyle(Theme.textQuaternary)
                        .accessibilityLabel("Character count \(trimmedText.count) of \(maxLength)")
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

    private var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isSendEnabled: Bool {
        !trimmedText.isEmpty && !disabled && !isLoading
    }

    private func submit() {
        guard !trimmedText.isEmpty else { return }
        #if canImport(UIKit)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
        onSubmit(trimmedText, selectedModel)
        text = ""
        isFocused = false
    }
}
