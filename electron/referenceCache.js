const cache = new Map();

const TTL = {
  SHORT: 60 * 1000,
  MEDIUM: 5 * 60 * 1000,
  LONG: 30 * 60 * 1000,
};

async function getCached(key, ttlMs, loader) {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.at < ttlMs) return entry.value;

  const value = await loader();
  cache.set(key, { value, at: now });
  return value;
}

function invalidate(keyOrPrefix) {
  if (!keyOrPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) {
      cache.delete(key);
    }
  }
}

module.exports = {
  TTL,
  getCached,
  invalidate,
};
