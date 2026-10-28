// Baseline security headers for every response. A Content-Security-Policy is left out
// for now: the pages still load the Kakao SDK, Nexon image hosts and inline styles,
// so it needs an origin inventory first (docs/remaining-tasks.md).
function securityHeaders(req, res, next) {
  res.set({
    "Strict-Transport-Security": "max-age=15552000",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  });
  next();
}

module.exports = { securityHeaders };
