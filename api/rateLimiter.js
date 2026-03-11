import Redis from 'ioredis';

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

// Fail-open rate limiter
export async function rateLimit(key, limit, window) {
  if (!redis) {
    // Redis not configured, allow the request (fail open)
    return { allowed: true };
  }

  const now = Date.now();
  const windowStart = now - window;
  const userKey = `rate_limit:${key}`;

  try {
    // Use Redis sorted set to store timestamps
    // Remove old timestamps outside the window
    await redis.zremrangebyscore(userKey, 0, windowStart);
    // Get current count
    const count = await redis.zcard(userKey);

    if (count >= limit) {
      return { allowed: false };
    }

    // Add new timestamp
    await redis.zadd(userKey, now, `${now}`);

    // Set expiry for the key slightly longer than window
    await redis.expire(userKey, Math.ceil(window / 1000) + 1);

    return { allowed: true, remaining: limit - count - 1 };
  } catch (err) {
    // Fail open on Redis error
    return { allowed: true };
  }
}
