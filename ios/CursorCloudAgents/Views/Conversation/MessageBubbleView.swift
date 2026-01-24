import SwiftUI

struct MessageBubbleView: View {
    let message: Message
    let maxWidth: CGFloat

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.type == .assistantMessage {
                CursorAvatar()
            } else {
                Spacer()
            }

            Text(message.text)
                .font(.subheadline)
                .foregroundStyle(message.type == .userMessage ? Theme.textPrimary : Theme.textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(message.type == .userMessage ? Theme.bgTertiary : Theme.bgQuaternary)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: maxWidth, alignment: message.type == .userMessage ? .trailing : .leading)

            if message.type == .assistantMessage {
                Spacer()
            }
        }
    }
}

private struct CursorAvatar: View {
    var body: some View {
        Circle()
            .fill(Theme.bgTertiary)
            .frame(width: 28, height: 28)
            .overlay(
                    Image(systemName: "cube")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(Theme.textSecondary)
            )
            .padding(.top, 2)
    }
}
