/**
 * Token-bucket rate limiter used to keep ChatGPT plan-usage requests inside the user's included
 * allowance (requests and tokens). Two buckets — requests and tokens — are acquired together;
 * acquire() resolves once both have room, waiting (with jitter) until they do.
 *
 * A sliding-window limiter would be a reasonable alternative; the bucket gives smoother
 * behaviour for streaming inference and avoids cliff edges at window boundaries.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly capacity: number, private readonly refillPerSecond: number) {
    this.tokens = capacity;
    this.last = Date.now();
  }
  async acquire(cost = 1): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = Date.now();
      const elapsed = (now - this.last) / 1000;
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
      this.last = now;
      if (this.tokens >= cost) { this.tokens -= cost; return; }
      const need = (cost - this.tokens) / this.refillPerSecond;
      await new Promise((r) => setTimeout(r, Math.max(50, Math.ceil(need * 1000)) + Math.floor(Math.random() * 50)));
    }
  }
}

export interface RateLimiterOptions { requestsPerMinute: number; tokensPerMinute: number; }
export class RateLimiter {
  private reqBucket: TokenBucket;
  private tokBucket: TokenBucket;
  constructor(opts: RateLimiterOptions) {
    this.reqBucket = new TokenBucket(opts.requestsPerMinute, opts.requestsPerMinute / 60);
    this.tokBucket = new TokenBucket(opts.tokensPerMinute, opts.tokensPerMinute / 60);
  }
  async acquire(tokens = 1): Promise<void> {
    await this.reqBucket.acquire(1);
    await this.tokBucket.acquire(Math.max(1, tokens));
  }
}