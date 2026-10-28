const axios = require("axios");

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// TTL + LRU cache bounded by entry count and approximate payload bytes.
class TtlLruCache {
  constructor({ maxEntries = 2000, maxBytes = 64 * 1024 * 1024, now = Date.now } = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.now = now;
    this.entries = new Map();
    this.totalBytes = 0;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }
    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs, sizeBytes = 0) {
    if (!(ttlMs > 0) || sizeBytes > this.maxBytes) {
      return;
    }
    this.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs, sizeBytes });
    this.totalBytes += sizeBytes;
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      this.delete(oldestKey);
    }
  }

  delete(key) {
    const entry = this.entries.get(key);
    if (entry) {
      this.totalBytes -= entry.sizeBytes;
      this.entries.delete(key);
    }
  }

  get size() {
    return this.entries.size;
  }
}

function createConcurrencyLimiter(maxConcurrency) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= maxConcurrency || queue.length === 0) {
      return;
    }
    active += 1;
    const { task, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

function toKstDateText(timestamp) {
  return new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// How long a successful response stays fresh, by endpoint.
function defaultTtlMs(path, params, now) {
  if (path.endsWith("/id") || path.endsWith("/guild/id")) {
    return 6 * 60 * 60 * 1000;
  }
  // Notices change a few times a day.
  if (path.includes("/notice")) {
    return 10 * 60 * 1000;
  }
  if (path.includes("/ranking/")) {
    const date = String(params?.date || "");
    const isPastDate = date && date < toKstDateText(now);
    return isPastDate ? 6 * 60 * 60 * 1000 : 5 * 60 * 1000;
  }
  return 2 * 60 * 1000;
}

// Client errors (unknown character, bad parameter) are cached briefly so the
// same failing lookup is not repeated against Nexon on every request.
const negativeCacheTtlMs = 60 * 1000;

function buildCacheKey(path, params) {
  const entries = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, String(value)])
    .sort(([left], [right]) => left.localeCompare(right));
  return `${path}?${new URLSearchParams(entries).toString()}`;
}

function parseRetryAfterMs(error) {
  const header = error?.response?.headers?.["retry-after"];
  if (header === undefined || header === null || header === "") {
    return null;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function isRetryableError(error) {
  const status = error?.response?.status;
  if (status === 429 || (status >= 500 && status <= 599)) {
    return true;
  }
  // No response at all: timeout or network failure.
  return !status && Boolean(error?.code || error?.request);
}

function estimateSizeBytes(data) {
  try {
    return JSON.stringify(data)?.length || 0;
  } catch {
    return 0;
  }
}

function createNexonClient({
  baseUrl,
  apiKey,
  transport,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  ttlMs = defaultTtlMs,
  maxRetries = 2,
  retryBaseDelayMs = 400,
  maxConcurrency = 8,
  timeoutMs = 10000,
  cache = new TtlLruCache({ now })
} = {}) {
  const send =
    transport ||
    ((url, params) =>
      axios.get(url, {
        params,
        headers: { "x-nxopen-api-key": apiKey },
        timeout: timeoutMs
      }));
  const limit = createConcurrencyLimiter(maxConcurrency);
  const inFlight = new Map();
  const stats = { requests: 0, cacheHits: 0, deduped: 0, nexonCalls: 0, retries: 0, failures: 0 };

  async function fetchWithRetry(url, params) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        stats.nexonCalls += 1;
        return await send(url, params);
      } catch (error) {
        if (attempt >= maxRetries || !isRetryableError(error)) {
          throw error;
        }
        stats.retries += 1;
        const backoffMs = retryBaseDelayMs * 2 ** attempt + Math.floor(random() * retryBaseDelayMs);
        await sleep(parseRetryAfterMs(error) ?? backoffMs);
      }
    }
  }

  async function request(path, params = {}, { useCache = true } = {}) {
    stats.requests += 1;
    const key = buildCacheKey(path, params);

    if (useCache) {
      const cached = cache.get(key);
      if (cached) {
        stats.cacheHits += 1;
        if (cached.error) {
          throw cached.error;
        }
        return { ...cached.result, cached: true };
      }
      if (inFlight.has(key)) {
        stats.deduped += 1;
        return inFlight.get(key);
      }
    }

    const url = `${baseUrl}${path}`;
    const pending = limit(() => fetchWithRetry(url, params))
      .then((response) => {
        const result = {
          endpoint: url,
          data: response.data,
          statusCode: response.status,
          fetchedAt: new Date(now()).toISOString()
        };
        cache.set(key, { result }, ttlMs(path, params, now()), estimateSizeBytes(response.data));
        return result;
      })
      .catch((error) => {
        stats.failures += 1;
        const status = error?.response?.status;
        if (status >= 400 && status < 500 && status !== 429) {
          cache.set(key, { error }, negativeCacheTtlMs, estimateSizeBytes(error.response?.data));
        }
        throw error;
      })
      .finally(() => {
        if (inFlight.get(key) === pending) {
          inFlight.delete(key);
        }
      });

    if (useCache) {
      inFlight.set(key, pending);
    }
    return pending;
  }

  return {
    request,
    getStats: () => ({ ...stats, cacheEntries: cache.size, inFlight: inFlight.size })
  };
}

module.exports = {
  TtlLruCache,
  buildCacheKey,
  createConcurrencyLimiter,
  createNexonClient,
  defaultTtlMs
};
