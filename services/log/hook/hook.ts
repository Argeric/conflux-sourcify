import winston, { type LogEntry } from "winston";
import Transport from 'winston-transport';

export type LogItem = LogEntry & {
  timestamp: string;
  service?: string;
};

interface HookCallback {
  (info: LogItem): void | Promise<void>;
}

interface HooksMap {
  [level: string]: Set<HookCallback>;
}

interface HookTransportOptions extends Transport.TransportStreamOptions {
  async?: boolean;
}

export class HookTransport extends Transport {
  private hooks: HooksMap = {};
  private readonly asyncMode: boolean;

  constructor(options: HookTransportOptions = {}) {
    super(options);

    this.asyncMode = options.async || false;

    const levels = ['error', 'warn', 'info', 'debug', 'silly'];
    levels.forEach(level => {
      this.hooks[level] = new Set();
    });
  }

  public registerHook(level: string, callback: HookCallback): () => void {
    if (!this.hooks[level]) {
      this.hooks[level] = new Set();
    }

    this.hooks[level].add(callback);

    return () => {
      this.hooks[level]?.delete(callback);
    };
  }

  public registerHooks(hooks: { [level: string]: HookCallback }): Array<() => void> {
    return Object.entries(hooks).map(([level, callback]) =>
      this.registerHook(level, callback)
    );
  }

  public clearHooks(level?: string): void {
    if (level) {
      this.hooks[level]?.clear();
    } else {
      Object.keys(this.hooks).forEach(key => {
        this.hooks[key]?.clear();
      });
    }
  }

  async log(info: LogItem, next: () => void): Promise<void> {
    try {
      const levelHooks = this.hooks[info.level];

      if (levelHooks && levelHooks.size > 0) {
        if (this.asyncMode) {
          this.executeHooksAsync(levelHooks, info).catch(error => {
            this.handleHookError(error, info);
          });
        } else {
          await this.executeHooksSync(levelHooks, info);
        }
      }

      next();
    } catch (error) {
      this.handleHookError(error, info);
      next();
    }
  }

  private async executeHooksSync(hooks: Set<HookCallback>, info: LogItem): Promise<void> {
    const promises = Array.from(hooks).map(async hook => {
      try {
        await hook(info);
      } catch (error) {
        this.handleHookError(error, info);
      }
    });

    await Promise.all(promises);
  }

  private async executeHooksAsync(hooks: Set<HookCallback>, info: LogItem): Promise<void> {
    Array.from(hooks).forEach(hook => {
      Promise.resolve()
        .then(() => hook(info))
        .catch(error => this.handleHookError(error, info));
    });
  }

  private handleHookError(error: unknown, info: LogItem): void {
    console.error(`Hook execution error for level ${info.level}:`, error);
  }
}
