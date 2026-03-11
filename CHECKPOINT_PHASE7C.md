Successfully installed 'ioredis'.

Created a new `rateLimiter.js` in api/ implementing fail-open Upstash Redis rate limiting using `process.env.REDIS_URL`.

Modified `api/gemini.js` and `api/ors.js` to import and apply the rate limiter with a limit of 10 requests per 60 seconds, keyed by client IP address.

This will protect these serverless endpoints from spam while gracefully handling Redis failures by allowing requests (fail open).

Task complete.