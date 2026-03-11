import { Logger } from "./counter";

export interface TimedCounterConfig {
  threshold: number; // report unhealthy if threshold reached
  remind: number;    // remind unhealthy if unrecovered for a long time
}

export const DEFAULT_TIMED_COUNTER_CONFIG: TimedCounterConfig = {
  threshold: 60 * 1000, // 1min（ms）
  remind: 5 * 60 * 1000 // 5min（ms）
};


export function defaultTimedCounterConfig(): TimedCounterConfig {
  return { ...DEFAULT_TIMED_COUNTER_CONFIG };
}


export class TimedCounter {
  private config: TimedCounterConfig;
  private failedAt: Date | null = null; // first failure time
  private reports: number = 0;          // number of times to report unhealthy

  constructor(config?: TimedCounterConfig) {
    this.config = config ? { ...config } : defaultTimedCounterConfig();
  }

  // isSuccess indicates whether any failure occurred.
  public isSuccess(): boolean {
    return this.failedAt === null;
  }

  // onSuccess erases failure status and return recover information if any.
  //
  //	@return recovered bool - indicates whether recovered from unhealthy status.
  //	@return elapsed time.Duration - indicates the duration since the first failure time.
  public onSuccess(): [recovered: boolean, elapsed: number] {
    return this.onSuccessAt(new Date());
  }

  private onSuccessAt(now: Date): [recovered: boolean, elapsed: number] {
    // last time was success status
    if (this.failedAt === null) {
      return [false, 0];
    }

    // report health now after a long time
    const elapsed = now.getTime() - this.failedAt.getTime();
    const recovered = elapsed >= this.config.threshold;

    // reset
    this.failedAt = null;
    this.reports = 0;

    return [recovered, elapsed];
  }

  // onFailure marks failure status and return unhealthy information.
  //
  //	@return unhealthy bool - indicates whether continuous failures occurred in a long time.
  //	@return unrecovered bool - indicates whether continuous failures occurred and unrecovered in a long time.
  //	@return elapsed time.Duration - indicates the duration since the first failure time.
  public onFailure(): [unhealthy: boolean, unrecovered: boolean, elapsed: number] {
    return this.onFailureAt(new Date());
  }

  private onFailureAt(now: Date): [unhealthy: boolean, unrecovered: boolean, elapsed: number] {
    // record the first failure time
    if (this.failedAt === null) {
      this.failedAt = now;
    }

    const elapsed = now.getTime() - this.failedAt.getTime();

    // error tolerant in short time
    if (elapsed < this.config.threshold) {
      return [false, false, elapsed];
    }

    // become unhealthy
    if (this.reports === 0) {
      this.reports++;
      return [true, false, elapsed];
    }

    // remind time not reached
    const remindTime = this.config.threshold + this.config.remind * this.reports;
    if (elapsed < remindTime) {
      return [false, false, elapsed];
    }

    // remind unhealthy
    this.reports++;
    return [false, true, elapsed];
  }

  // onError updates health status for the given `err` and returns health information.
  //
  //	@return recovered bool - indicates whether recovered from unhealthy status when `err` is nil.
  //	@return unhealthy bool - indicates whether continuous failures occurred in a long time when `err` is not nil.
  //	@return unrecovered bool - indicates whether continuous failures occurred and unrecovered in a long time when `err` is not nil.
  //	@return elapsed time.Duration - indicates the duration since the first failure time.
  public onError(err: Error | null | undefined): [boolean, boolean, boolean, number] {
    if (!err) {
      const [recovered, elapsed] = this.onSuccess();
      return [recovered, false, false, elapsed];
    } else {
      const [unhealthy, unrecovered, elapsed] = this.onFailure();
      return [false, unhealthy, unrecovered, elapsed];
    }
  }

  // logOnError updates health status for the given `err` and logs health information.
  public logOnError(
    err: Error | null | undefined,
    task: string,
    logger: Logger = console
  ): void {
    const [recovered, unhealthy, unrecovered, elapsed] = this.onError(err);

    if (recovered) {
      logger.warn(`Task is healthy now`, { task, elapsed });
    } else if (unhealthy) {
      logger.warn(`Task became unhealthy`, { task, elapsed, error: err });
    } else if (unrecovered) {
      logger.warn(`Task is not recovered in a long time`, { task, elapsed, error: err });
    }
  }
}