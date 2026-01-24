import SwiftUI

struct AgentRowView: View {
    let agent: Agent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            statusIcon
                .frame(width: 20, height: 20)

            VStack(alignment: .leading, spacing: 4) {
                Text(agent.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)

                Text("\(agent.model ?? "Composer 1") · \(DateFormatters.relativeTime(from: agent.createdAt))")
                    .font(.footnote)
                    .foregroundStyle(Theme.textTertiary)
            }

            Spacer()
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 14)
        .background(Color.clear)
        .contentShape(Rectangle())
    }

    private var statusIcon: some View {
        switch agent.status {
        case .creating, .running:
            return AnyView(CursorLoaderView(size: 18))
        case .error:
            return AnyView(Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(Theme.error))
        case .expired:
            return AnyView(Image(systemName: "clock.fill")
                .foregroundStyle(Theme.textTertiary))
        case .stopped:
            return AnyView(Image(systemName: "stop.fill")
                .foregroundStyle(Theme.textTertiary))
        case .finished:
            if agent.target.prUrl != nil {
                return AnyView(Image(systemName: "arrow.triangle.pull")
                    .foregroundStyle(Theme.textTertiary))
            }
            return AnyView(Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.textTertiary))
        }
    }
}
