import SwiftUI

struct UserAvatarView: View {
    let userEmail: String?
    let userName: String?
    let onLogout: () -> Void

    @Environment(\.openURL) private var openURL

    private var avatarLetter: String {
        guard let email = userEmail, let first = email.first else { return "?" }
        return String(first).uppercased()
    }

    var body: some View {
        Menu {
            VStack(alignment: .leading, spacing: 6) {
                if let userName {
                    Text(userName)
                        .font(.subheadline.weight(.semibold))
                }
                Text(userEmail ?? "Not signed in")
                    .font(.footnote)
                    .foregroundStyle(Theme.textTertiary)
            }

            Divider()

            Button("Go to Dashboard") {
                openURL(URL(string: "https://cursor.com/dashboard")!)
            }

            Button(role: .destructive, action: onLogout) {
                Text("Sign out")
            }
        } label: {
            Circle()
                .fill(Theme.bgTertiary)
                .frame(width: 36, height: 36)
                .overlay(
                    Text(avatarLetter)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.textSecondary)
                )
                .accessibilityLabel("Account menu")
        }
        .tint(Theme.textSecondary)
    }
}
