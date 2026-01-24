import SwiftUI

enum Theme {
    // MARK: - Core Colors (Dark Theme)
    static let bgMain = Color(hex: "14120B")
    static let bgCard = Color(hex: "1B1A15")
    static let bgCardHover = Color(hex: "262622")
    static let fg = Color(hex: "EDECEC")
    static let fgSecondary = Color(hex: "D7D6D5")

    // MARK: - Text Colors
    static let textPrimary = fg
    static let textSecondary = fg.opacity(0.6)
    static let textTertiary = fg.opacity(0.4)
    static let textQuaternary = fg.opacity(0.2)
    static let textInverted = bgMain

    // MARK: - Background Variants
    static let bgPrimary = fg
    static let bgSecondary = fg.opacity(0.08)
    static let bgTertiary = fg.opacity(0.06)
    static let bgQuaternary = fg.opacity(0.025)

    // MARK: - Borders
    static let borderStrong = fg.opacity(0.8)
    static let borderPrimary = fg.opacity(0.12)
    static let borderSecondary = fg.opacity(0.08)
    static let borderTertiary = fg.opacity(0.04)

    // MARK: - Accent
    static let accent = Color(hex: "F54E00")

    // MARK: - Status Colors
    static let statusIcon = Color(hex: "DDDDDD")
    static let error = Color(hex: "EF4444")
}
