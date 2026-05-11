import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

function makeHealthApp() {
  const app = express();
  app.get("/api/healthz", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));
  return app;
}

describe("healthz endpoint", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(makeHealthApp()).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
  });
});
