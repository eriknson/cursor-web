import SwiftUI

struct CursorLoaderView: View {
    var size: CGFloat = 24
    var loop: Bool = true
    @State private var isAnimating = false

    var body: some View {
        Image(systemName: "cube.transparent")
            .font(.system(size: size, weight: .regular))
            .foregroundStyle(Theme.textSecondary)
            .opacity(loop ? (isAnimating ? 1 : 0.4) : 1)
            .scaleEffect(loop ? (isAnimating ? 1 : 0.85) : 1)
            .onAppear {
                guard loop else { return }
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                    isAnimating = true
                }
            }
    }
}
