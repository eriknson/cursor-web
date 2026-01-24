import Foundation

actor RequestQueue {
    private var inFlight = 0
    private let maxConcurrent = 3
    private let minDelayNs: UInt64 = 100_000_000
    private var lastRequestTime: UInt64 = 0

    func enqueue<T>(operation: @escaping () async throws -> T) async throws -> T {
        while inFlight >= maxConcurrent {
            try await Task.sleep(nanoseconds: 50_000_000)
        }

        let now = DispatchTime.now().uptimeNanoseconds
        let elapsed = now - lastRequestTime
        if elapsed < minDelayNs {
            try await Task.sleep(nanoseconds: minDelayNs - elapsed)
        }

        inFlight += 1
        lastRequestTime = DispatchTime.now().uptimeNanoseconds
        defer { inFlight -= 1 }

        return try await operation()
    }
}
