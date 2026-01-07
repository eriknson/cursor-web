// Rate-limited request queue for Cursor API calls
// Prevents bursts of requests that trigger rate limiting

type QueuedRequest<T> = {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  priority: number; // Lower = higher priority
};

class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private inFlight = 0;
  private lastRequestTime = 0;
  
  // Tuned for Cursor API rate limits
  private readonly maxConcurrent = 2; // Max parallel requests
  private readonly minDelayMs = 150; // Min delay between requests
  private readonly burstDelayMs = 500; // Extra delay after burst detection
  private readonly burstThreshold = 5; // Requests in quick succession = burst
  private recentRequests: number[] = []; // Timestamps of recent requests

  async enqueue<T>(fn: () => Promise<T>, priority = 10): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = { fn, resolve, reject, priority };
      
      // Insert in priority order (lower priority value = higher priority)
      const insertIndex = this.queue.findIndex(r => r.priority > priority);
      if (insertIndex === -1) {
        this.queue.push(request as QueuedRequest<unknown>);
      } else {
        this.queue.splice(insertIndex, 0, request as QueuedRequest<unknown>);
      }
      
      this.processQueue();
    });
  }

  // High priority requests (e.g., user-initiated actions)
  async enqueueHigh<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue(fn, 1);
  }

  // Low priority requests (e.g., prefetching)
  async enqueueLow<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue(fn, 20);
  }

  private isBurstDetected(): boolean {
    const now = Date.now();
    // Clean old timestamps (older than 3 seconds)
    this.recentRequests = this.recentRequests.filter(t => now - t < 3000);
    return this.recentRequests.length >= this.burstThreshold;
  }

  private async processQueue(): Promise<void> {
    if (this.inFlight >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Calculate delay needed
    let delay = 0;
    if (timeSinceLastRequest < this.minDelayMs) {
      delay = this.minDelayMs - timeSinceLastRequest;
    }
    
    // Add extra delay if we're in a burst
    if (this.isBurstDetected()) {
      delay = Math.max(delay, this.burstDelayMs);
    }

    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }

    // Double-check queue state after delay
    if (this.inFlight >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.inFlight++;
    this.lastRequestTime = Date.now();
    this.recentRequests.push(this.lastRequestTime);

    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.inFlight--;
      // Process next item in queue
      this.processQueue();
    }
  }

  // Get queue stats for debugging
  getStats() {
    return {
      queued: this.queue.length,
      inFlight: this.inFlight,
      recentRequests: this.recentRequests.length,
    };
  }

  // Clear pending prefetch requests (low priority)
  clearLowPriority() {
    this.queue = this.queue.filter(r => r.priority < 10);
  }
}

// Singleton instance
export const requestQueue = new RequestQueue();
