export function initAnalytics(): void {}
export function captureEvent(_event: string, _properties?: Record<string, unknown>): void {}
export function captureException(_error: unknown, _properties?: Record<string, unknown>): void {}
export function capturePageView(_path: string): void {}
export function isAnalyticsEnabled(): boolean { return false; }
export function getTelemetryPreferenceEnabled(): boolean { return false; }
export function setTelemetryPreferenceEnabled(_enabled: boolean): void {}
