import SwiftUI

struct ThinkingIndicatorView: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.bgTertiary)
                .frame(width: 28, height: 28)
                .overlay(
                    Image(systemName: "cube.transparent")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(Theme.textSecondary)
                )
                .padding(.top, 2)

            Text(text)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .shimmer()
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.bgQuaternary)
                .clipShape(RoundedRectangle(cornerRadius: 16))

            Spacer()
        }
    }
}
