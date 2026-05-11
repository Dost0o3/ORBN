import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("zod input validation", () => {
  it("rejects oversized post content", () => {
    const schema = z.object({ content: z.string().min(1).max(5000) });
    const big = "x".repeat(5001);
    expect(() => schema.parse({ content: big })).toThrow();
    expect(schema.safeParse({ content: "hello" }).success).toBe(true);
  });

  it("rejects malformed email-like input", () => {
    const schema = z.object({ email: z.string().email() });
    expect(schema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(schema.safeParse({ email: "user@nexusid.app" }).success).toBe(true);
  });

  it("strips unknown fields by default", () => {
    const schema = z.object({ title: z.string() });
    const parsed = schema.parse({ title: "ok", danger: "<script>" } as never);
    expect(parsed).toEqual({ title: "ok" });
  });

  it("rejects negative numbers where positive required", () => {
    const schema = z.object({ amount: z.number().positive() });
    expect(schema.safeParse({ amount: -5 }).success).toBe(false);
    expect(schema.safeParse({ amount: 100 }).success).toBe(true);
  });
});

describe("power score calculation invariants", () => {
  function clamp(n: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, n));
  }

  function calcPowerScore(parts: { network: number; content: number; activity: number; reputation: number }): number {
    const n = clamp(parts.network) * 0.3;
    const c = clamp(parts.content) * 0.3;
    const a = clamp(parts.activity) * 0.2;
    const r = clamp(parts.reputation) * 0.2;
    return Math.round(n + c + a + r);
  }

  it("returns 0 for all-zero inputs", () => {
    expect(calcPowerScore({ network: 0, content: 0, activity: 0, reputation: 0 })).toBe(0);
  });

  it("returns 100 for all-max inputs", () => {
    expect(calcPowerScore({ network: 100, content: 100, activity: 100, reputation: 100 })).toBe(100);
  });

  it("clamps out-of-range values", () => {
    expect(calcPowerScore({ network: 200, content: -50, activity: 100, reputation: 50 })).toBeLessThanOrEqual(100);
    expect(calcPowerScore({ network: 200, content: -50, activity: 100, reputation: 50 })).toBeGreaterThanOrEqual(0);
  });

  it("weighting: network and content matter more than activity and reputation", () => {
    const networkHeavy = calcPowerScore({ network: 100, content: 100, activity: 0, reputation: 0 });
    const activityHeavy = calcPowerScore({ network: 0, content: 0, activity: 100, reputation: 100 });
    expect(networkHeavy).toBeGreaterThan(activityHeavy);
  });
});
