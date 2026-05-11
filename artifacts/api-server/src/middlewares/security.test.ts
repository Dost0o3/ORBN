import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { securityHeaders, generalRateLimiter, corsOriginCheck } from "./security";
import cors from "cors";

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(cors({ credentials: true, origin: corsOriginCheck }));
  app.use(generalRateLimiter);
  app.get("/api/healthz", (_req, res) => res.json({ ok: true }));
  app.get("/api/test", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("security middleware", () => {
  it("sets security headers via helmet", async () => {
    const res = await request(makeApp()).get("/api/test");
    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  it("does not rate-limit healthz", async () => {
    const app = makeApp();
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get("/api/healthz");
      expect(res.status).toBe(200);
    }
  });
});

describe("cors origin check", () => {
  const ORIGINAL = process.env.ALLOWED_ORIGINS;
  beforeEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = ORIGINAL;
  });

  it("allows any origin when ALLOWED_ORIGINS unset", () => {
    return new Promise<void>((resolve, reject) => {
      corsOriginCheck("https://anything.example.com", (err, allow) => {
        try {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  it("allows whitelisted origin", () => {
    process.env.ALLOWED_ORIGINS = "https://nexusid.app,https://www.nexusid.app";
    return new Promise<void>((resolve, reject) => {
      corsOriginCheck("https://nexusid.app", (err, allow) => {
        try {
          expect(err).toBeNull();
          expect(allow).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  it("rejects non-whitelisted origin", () => {
    process.env.ALLOWED_ORIGINS = "https://nexusid.app";
    return new Promise<void>((resolve, reject) => {
      corsOriginCheck("https://evil.example.com", (err) => {
        try {
          expect(err).toBeInstanceOf(Error);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });
});
