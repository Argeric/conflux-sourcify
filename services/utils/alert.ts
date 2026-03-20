import { TimedCounter } from "../health/timedCounter";
import { defaultManager } from "../alert/manager";
import { Notification, Severity } from "../alert/formatter/types";

export class AlertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlertError";
  }
}

export class AlertContent {
  constructor(public reason: string, public elapsed: number, public url: string) {
  }

  toString(): string {
    if (!this.url) {
      return `---\nReason: ${this.reason}\nElapsed: ${this.formatTime(this.elapsed)}`;
    }
    return `---\nReason: ${this.reason}\nURL: ${this.url}\nElapsed: ${this.formatTime(this.elapsed)}`;
  }

  formatTime(milliseconds: number, decimalPlaces: number = 3): string {
    const totalSeconds = milliseconds / 1000;

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = (totalSeconds % 60).toFixed(decimalPlaces);

    if (hours > 0) {
      return `${hours}h${minutes}m${seconds}s`; // 136h37m0.896s
    } else {
      return `${minutes}m${seconds}s`; // 37m0.896s
    }
  }
}

export async function alertError(
  title: string,
  health: TimedCounter,
  channels: string[],
  err: Error | null | undefined,
  ...urls: string[]
) {
  const errs = [];

  for (const channel of channels) {
    try {
      const ch = defaultManager().channel(channel);
      if (!ch) {
        return new Error(`Failed to find alert channel ${channel}`);
      }

      const url = !urls?.length ? "" : urls[0];

      if (!err) {
        const [recovered, elapsed] = health.onSuccess();
        if (recovered) {
          await ch.send({
            title,
            content: new AlertContent("Recovered", elapsed, url).toString(),
            severity: Severity.Low
          } as Notification);
        }
        continue;
      }

      const [unhealthy, unrecovered, elapsed] = health.onFailure();
      if (unhealthy || unrecovered) {
        await ch.send({
          title,
          content: new AlertContent(err.message, elapsed, url).toString(),
          severity: Severity.High
        } as Notification);
      }
    } catch (err: any) {
      errs.push(err.message);
    }
  }

  if (errs?.length) {
    throw new AlertError(errs.join(";"));
  }
}