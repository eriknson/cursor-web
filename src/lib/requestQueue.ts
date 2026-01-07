// Rate-limited request queue for Cursor API calls
// Prevents bursts of requests that trigger rate limiting

type QueuedRequest<T> = {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  priority: number; // Lower = higher priority
  createdAt: number; // Timestamp for timeout detection
};

class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private inFlight = 0;
  private lastRequestTime = 0;
  private processing = false; // Prevent concurrent processQueue calls
  
  // Tuned for Cursor API rate limits - slightly more aggressive for better responsiveness
  private readonly maxConcurrent = 3; // Max parallel requests (up from 2)
  private readonly minDelayMs = 100; // Min delay between requests (down from 150)
  private readonly burstDelayMs = 300; // Extra delay after burst detection (down from 500)
  private readonly burstThreshold = 8; // Requests in quick succession = burst (up from 5)
  private readonly requestTimeoutMs = 45000; // Timeout for queued requests
  private recentRequests: number[] = []; // Timestamps of recent requests

  async enqueue<T>(fn: () => Promise<T>, priority = 10): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = { 
        fn, 
        resolve, 
        reject, 
        priority,
        createdAt: Date.now(),
      };
      
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
  
  // Clean up stale requests that have been waiting too long
  private cleanupStaleRequests(): void {
    const now = Date.now();
    const staleRequests = this.queue.filter(
      r => now - r.createdAt > this.requestTimeoutMs
    );
    
    // Remove stale requests and reject them
    for (const request of staleRequests) {
      const index = this.queue.indexOf(request);
      if (index !== -1) {
        this.queue.splice(index, 1);
        request.reject(new Error('Request timed out in queue'));
      }
    }
  }

  private async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.processing) return;
    this.processing = true;
    
    try {
      // Clean up any stale requests first
      this.cleanupStaleRequests();
      
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

      // Execute request without blocking the queue processing
      this.executeRequest(request);
    } finally {
      this.processing = false;
    }
  }
  
  private async executeRequest(request: QueuedRequest<unknown>): Promise<void> {
    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.inFlight--;
      // Schedule next item processing (don't await to avoid blocking)
      setTimeout(() => this.processQueue(), 0);
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
