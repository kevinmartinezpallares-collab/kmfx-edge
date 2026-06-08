import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAdminEmailAllowed,
  isGeneticLabEnabled,
  isGeneticLabPath,
  parseAdminEmails,
} from "@/lib/auth/admin-access";

describe("admin access guards", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("parses comma-separated admin Gmail allowlists safely", () => {
    expect(parseAdminEmails(" Admin@gmail.com, owner@gmail.com ,, ")).toEqual([
      "admin@gmail.com",
      "owner@gmail.com",
    ]);
  });

  it("allows only configured admin emails", () => {
    vi.stubEnv("KMFX_ADMIN_EMAILS", "admin@gmail.com");
    vi.stubEnv("KMFX_GENETIC_OWNER_EMAIL", "owner@gmail.com");

    expect(isAdminEmailAllowed("ADMIN@gmail.com")).toBe(true);
    expect(isAdminEmailAllowed("owner@gmail.com")).toBe(true);
    expect(isAdminEmailAllowed("student@gmail.com")).toBe(false);
    expect(isAdminEmailAllowed(null)).toBe(false);
  });

  it("keeps the genetic lab disabled unless explicitly enabled", () => {
    vi.stubEnv("KMFX_ENABLE_GENETIC_LAB", "");
    expect(isGeneticLabEnabled()).toBe(false);

    vi.stubEnv("KMFX_ENABLE_GENETIC_LAB", "1");
    expect(isGeneticLabEnabled()).toBe(true);
  });

  it("matches hidden Strategy Lab and internal genetic API paths", () => {
    expect(isGeneticLabPath("/strategy-lab")).toBe(true);
    expect(isGeneticLabPath("/strategy-lab/runs")).toBe(true);
    expect(isGeneticLabPath("/genetic-lab")).toBe(true);
    expect(isGeneticLabPath("/api/internal/genetic/runs")).toBe(true);
    expect(isGeneticLabPath("/dashboard")).toBe(false);
  });
});
