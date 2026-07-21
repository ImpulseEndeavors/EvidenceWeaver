import { randomUUID, timingSafeEqual } from "node:crypto";

const permissions = {
  viewer: new Set(["read"]),
  analyst: new Set(["read", "investigate"]),
  admin: new Set(["read", "investigate", "admin"]),
};

function configurationError(message) {
  const error = new Error(message);
  error.code = "SECURITY_CONFIGURATION_ERROR";
  return error;
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function loadSecurityConfiguration(env = process.env) {
  const appMode = env.APP_MODE === "production" ? "production" : "demo";
  const authMode = appMode === "production" ? env.AUTH_MODE : "local-demo";
  const publicOrigin = env.PUBLIC_ORIGIN?.replace(/\/$/, "") || "";
  const encryptedAtRest = Boolean(env.DATA_ENCRYPTION_KEY);
  const custodyAuthenticated = Boolean(env.CUSTODY_HMAC_KEY);
  if (appMode === "production") {
    const missing = [];
    if (authMode !== "external-oidc-proxy") missing.push("AUTH_MODE=external-oidc-proxy");
    if (!env.AUTH_PROXY_SECRET || env.AUTH_PROXY_SECRET.length < 32) missing.push("AUTH_PROXY_SECRET (32+ characters)");
    if (!publicOrigin.startsWith("https://")) missing.push("PUBLIC_ORIGIN=https://…");
    if (!encryptedAtRest) missing.push("DATA_ENCRYPTION_KEY");
    if (!custodyAuthenticated) missing.push("CUSTODY_HMAC_KEY");
    if (missing.length) throw configurationError(`Production mode refused to start. Missing secure configuration: ${missing.join(", ")}.`);
  }
  return {
    appMode, authMode, publicOrigin,
    proxySecret: env.AUTH_PROXY_SECRET || "",
    encryptedAtRest, custodyAuthenticated,
    host: env.HOST || "127.0.0.1",
  };
}

export function publicSecurityStatus(config) {
  return {
    appMode: config.appMode,
    authentication: config.authMode,
    authorization: "role-based access control",
    encryptedAtRest: config.encryptedAtRest,
    custodyLedger: true,
    custodyAuthenticated: config.custodyAuthenticated,
    secureTransportRequired: config.appMode === "production",
    productionReady: config.appMode === "production" && config.encryptedAtRest && config.custodyAuthenticated,
  };
}

export function resolveActor(request, config) {
  if (config.appMode === "demo") return { id: "local-demo-operator", displayName: "Local demo operator", role: "admin", authenticationMethod: "local-demo" };
  if (!constantTimeEqual(request.headers["x-evidenceweaver-proxy-secret"], config.proxySecret)) throw httpError("Authenticated identity proxy required.", 401);
  const id = String(request.headers["x-evidenceweaver-user-id"] || "").trim().slice(0, 160);
  const displayName = String(request.headers["x-evidenceweaver-user-name"] || id).trim().slice(0, 160);
  const role = String(request.headers["x-evidenceweaver-user-role"] || "viewer").toLowerCase();
  if (!id || !permissions[role]) throw httpError("The identity proxy did not supply a valid user and role.", 401);
  return { id, displayName, role, authenticationMethod: "external-oidc-proxy" };
}

export function authorize(actor, permission) {
  if (!permissions[actor.role]?.has(permission)) throw httpError("You do not have permission to perform this action.", 403);
}

export function permissionFor(request, url) {
  if (request.method === "GET") return "read";
  if (request.method === "DELETE" || (request.method === "POST" && url.pathname === "/api/cases")) return "admin";
  return "investigate";
}

export function assertTrustedOrigin(request, config) {
  if (!["POST", "PATCH", "DELETE", "PUT"].includes(request.method)) return;
  const origin = request.headers.origin;
  if (config.appMode === "production") {
    if (origin !== config.publicOrigin) throw httpError("Request origin is not allowed.", 403);
    return;
  }
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) throw httpError("Demo mode accepts mutations only from a local origin.", 403);
  } catch (error) {
    if (error.statusCode) throw error;
    throw httpError("Request origin is invalid.", 403);
  }
}

export function securityHeaders(config) {
  const headers = {
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
  };
  if (config.appMode === "production") headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
  return headers;
}

export class RateLimiter {
  constructor() { this.entries = new Map(); }
  consume(request, bucket = "default", limit = 120, windowMs = 60_000) {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const address = forwarded || request.socket.remoteAddress || "unknown";
    const key = `${address}:${bucket}`;
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + windowMs };
    entry.count += 1; this.entries.set(key, entry);
    if (entry.count > limit) throw httpError("Too many requests. Try again shortly.", 429);
    if (this.entries.size > 5_000) for (const [candidate, value] of this.entries) if (value.resetAt <= now) this.entries.delete(candidate);
  }
}

export function newRequestId(request) {
  const supplied = String(request.headers["x-request-id"] || "");
  return /^[a-zA-Z0-9._-]{8,100}$/.test(supplied) ? supplied : randomUUID();
}
