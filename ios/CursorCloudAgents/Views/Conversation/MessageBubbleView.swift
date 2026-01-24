import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct MessageBubbleView: View {
    let message: Message
    let maxWidth: CGFloat
    var isPending: Bool = false
    var animate: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.type == .assistantMessage {
                CursorAvatar()
            } else {
                Spacer()
            }

            bubbleText
                .font(.subheadline)
                .foregroundStyle(message.type == .userMessage ? Theme.textPrimary : Theme.textSecondary)
                .textSelection(.enabled)
                .accessibilityLabel(message.type == .userMessage ? "You said: \(message.text)" : "Cursor said: \(message.text)")
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(message.type == .userMessage ? Theme.bgTertiary : Theme.bgQuaternary)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: maxWidth, alignment: message.type == .userMessage ? .trailing : .leading)
                .opacity(isPending ? 0.7 : 1)
                .contextMenu {
                    Button("Copy") {
                        #if canImport(UIKit)
                        UIPasteboard.general.string = message.text
                        #endif
                    }
                }

            if message.type == .assistantMessage {
                Spacer()
            }
        }
    }
}

private extension MessageBubbleView {
    @ViewBuilder
    var bubbleText: some View {
        if message.type == .assistantMessage {
            TypewriterText(text: message.text, isActive: animate)
        } else {
            Text(message.text)
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

private struct TypewriterText: View {
    let text: String
    let isActive: Bool
    private let charactersPerSecond: Double = 50

    @State private var displayedCount: Int = 0
    @State private var typingTask: Task<Void, Never>?

    var body: some View {
        Text(String(text.prefix(displayedCount)))
            .onAppear {
                syncDisplay()
            }
            .onChange(of: text) { _, _ in
                syncDisplay()
            }
            .onChange(of: isActive) { _, _ in
                syncDisplay()
            }
            .onDisappear {
                typingTask?.cancel()
            }
    }

    private func syncDisplay() {
        typingTask?.cancel()

        guard isActive else {
            displayedCount = text.count
            return
        }

        if displayedCount > text.count {
            displayedCount = text.count
            return
        }

        if displayedCount < text.count {
            startTyping(from: displayedCount)
        }
    }

    private func startTyping(from start: Int) {
        typingTask = Task {
            var count = start
            let delay = UInt64(1_000_000_000 / charactersPerSecond)
            while count < text.count, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: delay)
                count += 1
                await MainActor.run {
                    displayedCount = min(count, text.count)
                }
            }
        }
    }
}
