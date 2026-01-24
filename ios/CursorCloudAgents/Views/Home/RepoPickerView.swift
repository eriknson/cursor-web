import SwiftUI

struct RepoPickerView: View {
    let repositories: [Repository]
    @Binding var selectedRepository: Repository?
    var isLoading: Bool
    var showAllOption: Bool = false

    @State private var isPresented = false

    private var displayName: String {
        if let selectedRepository {
            return selectedRepository.name
        }
        return showAllOption ? "All Repositories" : "Select repo"
    }

    var body: some View {
        Button {
            isPresented = true
        } label: {
            HStack(spacing: 8) {
                CursorLoaderView(size: 20, loop: false)
                Text(isLoading ? "Loading..." : displayName)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.textTertiary)
            }
        }
        .disabled(isLoading)
        .accessibilityLabel("Repository picker")
        .accessibilityValue(displayName)
        .accessibilityHint("Opens repository list")
        .sheet(isPresented: $isPresented) {
            NavigationStack {
                List {
                    if showAllOption {
                        Button {
                            selectedRepository = nil
                            isPresented = false
                        } label: {
                            HStack {
                                Text("All Repositories")
                                Spacer()
                                if selectedRepository == nil {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Theme.accent)
                                }
                            }
                        }
                        .listRowBackground(Theme.bgMain)
                    }

                    Section {
                        if repositories.isEmpty {
                            Text("No repositories found")
                                .font(.footnote)
                                .foregroundStyle(Theme.textQuaternary)
                                .listRowBackground(Theme.bgMain)
                        }

                        ForEach(repositories) { repo in
                            Button {
                                selectedRepository = repo
                                isPresented = false
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(repo.name)
                                            .font(.subheadline.weight(.medium))
                                            .foregroundStyle(Theme.textPrimary)
                                        Text(repo.owner)
                                            .font(.footnote)
                                            .foregroundStyle(Theme.textTertiary)
                                    .accessibilityHidden(true)
                                    }
                                    Spacer()
                                    if let pushedAt = repo.pushedAt {
                                        Text(DateFormatters.relativeTime(from: pushedAt))
                                            .font(.footnote)
                                            .foregroundStyle(Theme.textQuaternary)
                                    }
                                    if selectedRepository?.id == repo.id {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(Theme.accent)
                                    }
                                }
                            }
                            .listRowBackground(Theme.bgMain)
                        }
                    } header: {
                        Text("Repositories")
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
                .scrollContentBackground(.hidden)
                .background(Theme.bgMain)
                .navigationTitle("Select Repository")
                .navigationBarTitleDisplayMode(.inline)
                .listStyle(.insetGrouped)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { isPresented = false }
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
            }
        }
    }
}
