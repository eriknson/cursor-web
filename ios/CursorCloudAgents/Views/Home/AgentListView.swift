import SwiftUI

struct AgentListView: View {
    let groupedAgents: [(title: String, agents: [Agent])]
    let isLoading: Bool
    let errorMessage: String?
    let emptyMessage: String
    let onRefresh: () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let errorMessage {
                    ErrorView(message: errorMessage)
                }

                if isLoading {
                    VStack(spacing: 12) {
                        CursorLoaderView(size: 32)
                        Text("Loading agents...")
                            .font(.footnote)
                            .foregroundStyle(Theme.textTertiary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                } else if groupedAgents.isEmpty {
                    Text(emptyMessage)
                        .font(.footnote)
                        .foregroundStyle(Theme.textQuaternary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 40)
                } else {
                    ForEach(groupedAgents, id: \.title) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(group.title)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Theme.textTertiary)
                                .padding(.horizontal, 8)

                            ForEach(group.agents) { agent in
                                NavigationLink(value: agent) {
                                    AgentRowView(agent: agent)
                                }
                                .buttonStyle(.plain)
                                .background(Theme.bgCard.opacity(0.001))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                }
            }
            .padding(.top, 8)
            .refreshable {
                await onRefresh()
            }
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .accessibilityLabel("Agent list")
        .accessibilityHint("Shows recent agent runs grouped by date")
        .accessibilityAddTraits(.isSummaryElement)
    }
}
