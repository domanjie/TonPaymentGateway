import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  enableAutoPipelining: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

redis.on("connect", () => {
  console.info("Redis connected");
});
