export enum Severity {
  Low,
  Medium,
  High,
  Critical
}

export function severityToString(s: Severity): string {
  switch (s) {
    case Severity.Low:
      return "low";
    case Severity.Medium:
      return "medium";
    case Severity.High:
      return "high";
    case Severity.Critical:
      return "critical";
    default:
      return "unknown";
  }
}

export interface Notification {
  title: string;
  content: any;
  severity: Severity;
}

// Log item interface for TypeScript
export interface LogItem {
  level: string;
  time: Date;
  message: string;
  error?: Error;
  ctxFields?: Record<string, unknown>;
}