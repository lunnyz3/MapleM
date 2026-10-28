const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter, resolveClientIp } = require("../src/middleware/rate-limit");
const { securityHeaders } = require("../src/middleware/security-headers");

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) {
      if (typeof name === "object") {
        Object.assign(this.headers, name);
      } else {
        this.headers[name] = value;
      }
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

const request = (ip) => ({ headers: { "cf-connecting-ip": ip }, socket: { remoteAddress: "127.0.0.1" } });

test("resolveClientIp prefers Cloudflare, then X-Forwarded-For, then the socket", () => {
  assert.equal(resolveClientIp({ headers: { "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" } }), "1.1.1.1");
  assert.equal(resolveClientIp({ headers: { "x-forwarded-for": "2.2.2.2, 10.0.0.1" } }), "2.2.2.2");
  assert.equal(resolveClientIp({ headers: {}, socket: { remoteAddress: "127.0.0.1" } }), "127.0.0.1");
});

test("rate limiter allows up to max per window per IP, then answers 429 with Retry-After", () => {
  let clock = 0;
  const limiter = createRateLimiter({ name: "t", windowMs: 60000, max: 2, now: () => clock });
  let passed = 0;
  const next = () => {
    passed += 1;
  };

  limiter(request("1.1.1.1"), fakeResponse(), next);
  limiter(request("1.1.1.1"), fakeResponse(), next);
  const blocked = fakeResponse();
  limiter(request("1.1.1.1"), blocked, next);
  limiter(request("9.9.9.9"), fakeResponse(), next);

  assert.equal(passed, 3);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["Retry-After"], "60");
  assert.equal(blocked.body.code, "RATE_LIMITED");

  clock = 60001;
  limiter(request("1.1.1.1"), fakeResponse(), next);
  assert.equal(passed, 4, "a new window starts after windowMs");
});

test("security headers are set on every response", () => {
  const res = fakeResponse();
  let called = false;
  securityHeaders({}, res, () => {
    called = true;
  });
  assert.ok(called);
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "SAMEORIGIN");
  assert.match(res.headers["Strict-Transport-Security"], /max-age=\d+/);
});
