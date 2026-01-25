import Foundation

enum DateFormatters {
    static func relativeTime(from date: Date, now: Date = Date()) -> String {
        let diff = now.timeIntervalSince(date)
        let minutes = Int(diff / 60)
        let hours = Int(diff / 3600)
        let days = Int(diff / 86_400)
        let weeks = Int(diff / 604_800)

        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(minutes)m ago" }
        if hours < 24 { return "\(hours)h ago" }
        if days < 7 { return "\(days)d ago" }
        return "\(weeks)w ago"
    }

    static func dateGroupTitle(for date: Date, now: Date = Date()) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return "Today"
        }
        if calendar.isDateInYesterday(date) {
            return "Yesterday"
        }
        if let sevenDaysAgo = calendar.date(byAdding: .day, value: -7, to: now), date >= sevenDaysAgo {
            return "Last 7 Days"
        }
        return "Older"
    }
}
