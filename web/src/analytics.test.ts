// Verifies that the analytics module exports no-op stubs after PostHog removal.
describe("analytics (no-op stubs)", () => {
  it("exports all expected functions as no-ops", async () => {
    const mod = await import("./analytics.js");

    // All functions should be callable without throwing
    expect(mod.initAnalytics()).toBeUndefined();
    expect(mod.captureEvent("test")).toBeUndefined();
    expect(mod.captureException(new Error("boom"))).toBeUndefined();
    expect(mod.capturePageView("#/test")).toBeUndefined();
    expect(mod.setTelemetryPreferenceEnabled(true)).toBeUndefined();

    // Analytics is always disabled
    expect(mod.isAnalyticsEnabled()).toBe(false);
    expect(mod.getTelemetryPreferenceEnabled()).toBe(false);
  });
});
