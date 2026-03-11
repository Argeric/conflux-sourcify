export interface CounterConfig {
  threshold: number;  // report unhealthy if threshold reached
  remind: number;     // remind unhealthy if unrecovered for a long time
}

export function defaultCounterConfig(): CounterConfig {
  return {
    threshold: 60,
    remind: 60
  };
}

// Counter represents an error tolerant health counter, which allows continuous failures in a short time
// and periodically remind unhealthy if unrecovered in time.
export class Counter {
  private config: CounterConfig;
  private failures: number = 0;

  constructor(config?: Partial<CounterConfig>) {
    const defaultConfig = defaultCounterConfig();
    this.config = {
      threshold: config?.threshold ?? defaultConfig.threshold,
      remind: config?.remind ?? defaultConfig.remind
    };
  }

  // isSuccess indicates whether any failure occurred.
  isSuccess(): boolean {
    return this.failures === 0;
  }

  // onSuccess erases failure status and return recover information if any.
  //
  //  @return recovered bool - indicates whether recovered from unhealthy status.
  //  @return failures uint64 - indicates the number of continuous failures before success.
  onSuccess(): { recovered: boolean; failures: number } {
    // last time was success status
    if (this.failures === 0) {
      return { recovered: false, failures: 0 };
    }

    // report health now after a long time
    const failures = this.failures;
    const recovered = failures >= this.config.threshold;

    // reset
    this.failures = 0;

    return { recovered, failures };
  }

  // onFailure marks failure status and return unhealthy information.
  //
  //	@return unhealthy bool - indicates whether continuous failures occurred in a long time.
  //	@return unrecovered bool - indicates whether continuous failures occurred and unrecovered in a long time.
  //	@return failures uint64 - indicates the number of continuous failures so far.
  onFailure(): { unhealthy: boolean; unrecovered: boolean; failures: number } {
    this.failures++;

    // error tolerant in short time
    if (this.failures < this.config.threshold) {
      return {
        unhealthy: false,
        unrecovered: false,
        failures: this.failures
      };
    }

    const delta = this.failures - this.config.threshold;

    return {
      unhealthy: delta === 0,
      unrecovered: delta > 0 && delta % this.config.remind === 0,
      failures: this.failures
    };
  }

  // onError updates health status for the given `err` and returns health information.
  //
  //	@return recovered bool - indicates whether recovered from unhealthy status when `err` is nil.
  //	@return unhealthy bool - indicates whether continuous failures occurred in a long time when `err` is not nil.
  //	@return unrecovered bool - indicates whether continuous failures occurred and unrecovered in a long time when `err` is not nil.
  //	@return failures uint64 - indicates the number of continuous failures so far.
  onError(err: Error | null | undefined): {
    recovered: boolean;
    unhealthy: boolean;
    unrecovered: boolean;
    failures: number;
  } {
    if (!err) {
      const { recovered, failures } = this.onSuccess();
      return {
        recovered,
        unhealthy: false,
        unrecovered: false,
        failures
      };
    } else {
      const { unhealthy, unrecovered, failures } = this.onFailure();
      return {
        recovered: false,
        unhealthy,
        unrecovered,
        failures
      };
    }
  }

  // logOnError updates health status for the given `err` and logs health information.
  logOnError(
    err: Error | null | undefined,
    task: string,
    logger: Logger = console
  ): void {
    const { recovered, unhealthy, unrecovered, failures } = this.onError(err);

    if (recovered) {
      logger.warn(`Task is healthy now`, {
        task,
        failures,
        event: "health.recovered"
      });
    } else if (unhealthy) {
      logger.warn(`Task became unhealthy`, {
        task,
        failures,
        error: err?.message,
        stack: err?.stack,
        event: "health.unhealthy"
      });
    } else if (unrecovered) {
      logger.warn(`Task is not recovered in a long time`, {
        task,
        failures,
        error: err?.message,
        stack: err?.stack,
        event: "health.unrecovered"
      });
    }
  }
}

export interface Logger {
  info(message: string, ...meta: any[]): void;

  warn(message: string, ...meta: any[]): void;

  error(message: string, ...meta: any[]): void;

  debug(message: string, ...meta: any[]): void;
}
