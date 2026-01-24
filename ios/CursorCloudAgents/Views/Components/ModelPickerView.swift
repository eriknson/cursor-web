import SwiftUI

struct ModelOption: Identifiable, Hashable {
    let id: String
    let label: String
}

let modelOptions: [ModelOption] = [
    ModelOption(id: "composer-1", label: "Composer 1"),
    ModelOption(id: "gpt-5.2", label: "GPT-5.2"),
    ModelOption(id: "opus-4.5", label: "Opus 4.5")
]

struct ModelPickerView: View {
    @Binding var selectedModel: String

    var body: some View {
        Picker("Model", selection: $selectedModel) {
            ForEach(modelOptions) { option in
                Text(option.label).tag(option.id)
            }
        }
        .pickerStyle(.menu)
        .tint(Theme.textSecondary)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Theme.bgTertiary)
        .clipShape(Capsule())
    }
}
