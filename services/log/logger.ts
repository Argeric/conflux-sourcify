import type { Logger } from "winston";
import { createLogger, transports, format } from "winston";
import chalk from "chalk";
import path from "path";
import { setLibSourcifyLoggerLevel } from "@ethereum-sourcify/lib-sourcify";
import { setCompilersLoggerLevel } from "@ethereum-sourcify/compilers";
import dotenv from "dotenv";
import { addAlertHook, HookTransport } from "./hook/hook";
import { LoggingConfig } from "../../config/Loader";

dotenv.config({ path: path.resolve(__dirname, "../..", ".env") });

export enum LogLevels {
  error = 0,
  warn = 1,
  info = 2,
  debug = 5,
  silly = 6,
}

const validLogLevels = Object.values(LogLevels);

const rawLineFormat = format.printf(
  ({ level, message, timestamp, service, traceId, ...metadata }: any) => {
    const traceIdMsg = traceId ? chalk.grey(`[traceId=${traceId}]`) : "";
    let msg = `${timestamp} [${level}] ${service ? service : ""} ${chalk.bold(message)}`;
    if (metadata && Object.keys(metadata).length > 0) {
      msg += " - ";
      const metadataMsg = Object.entries(metadata)
        .map(([key, value]) => {
          if (typeof value === "object") {
            try {
              value = JSON.stringify(value);
            } catch (e) {
              value = "SerializationError: Unable to serialize object";
            }
          }
          return `${key}=${value}`;
        })
        .join(" | ");
      msg += chalk.grey(metadataMsg);
      msg += traceIdMsg && " - " + traceIdMsg;
    }
    return msg;
  }
);

// Error formatter, since error objects are non-enumerable and will return "{}"
const errorFormatter = format((info) => {
  if (info.error instanceof Error) {
    // Convert the error object to a plain object
    // Including standard error properties and any custom ones
    info.error = Object.assign(
      {
        message: info.error.message,
        stack: info.error.stack,
        name: info.error.name
      },
      info.error
    );
  }
  return info;
});

const jsonFormat = format.combine(
  errorFormatter(),
  format.timestamp(),
  format.json()
);

const lineFormat = format.combine(
  errorFormatter(),
  format.timestamp(),
  format.colorize(),
  rawLineFormat
);

const consoleTransport = new transports.Console({
  // NODE_LOG_LEVEL is takes precedence, otherwise use "info" if in production, "debug" otherwise
  format: process.env.NODE_ENV === "production" ? jsonFormat : lineFormat
});

const hookTransport = new HookTransport({
  format: format.timestamp(),
  async: true
});

const loggerInstance: Logger = createLogger({
  transports: [
    hookTransport,
    consoleTransport
  ]
});

const serverLoggerInstance = loggerInstance.child({
  service:
    process.env.NODE_ENV === "production"
      ? "server"
      : chalk.magenta("[Server]")
});
export default serverLoggerInstance;

const logLevelStringToNumber = (level: string): number => {
  switch (level) {
    case "error":
      return LogLevels.error;
    case "warn":
      return LogLevels.warn;
    case "info":
      return LogLevels.info;
    case "debug":
      return LogLevels.debug;
    case "silly":
      return LogLevels.silly;
    default:
      return LogLevels.info;
  }
};

// Function to change the log level dynamically
export function setLogLevel(log: LoggingConfig): void {
  const level = log.level;
  if (!validLogLevels.includes(level)) {
    throw new Error(
      `Invalid log level: ${level}. level can take: ${validLogLevels.join(
        ", "
      )}`
    );
  }

  consoleTransport.level = level;
  process.env.NODE_LOG_LEVEL = level;

  setLibSourcifyLoggerLevel(logLevelStringToNumber(level));
  setCompilersLoggerLevel(logLevelStringToNumber(level));

  addAlertHook(hookTransport, log.alertHook);

  console.info(`Succeed to set log level: ${level}`);
}
