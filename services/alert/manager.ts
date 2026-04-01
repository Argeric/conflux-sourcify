import { AlertConfig, Channel, ChannelType, ChannelTypeNotSupportedError } from "./types";
import { createDingtalkMsgFormatter, DingTalkChannel, DingTalkConfig } from "./dingtalk";
import { TelegramChannel, TelegramConfig } from "./telegram";
import { TelegramMarkdownFormatter } from "./formatter/formatter";
import logger from "../log/logger";

let defaultManagerInstance: Manager | null = null;

export function defaultManager(): Manager {
  if (!defaultManagerInstance) {
    defaultManagerInstance = new Manager();
  }

  return defaultManagerInstance;
}

export class Manager {

  private allChannels: Map<string, Channel> = new Map();

  add(ch: Channel): Channel | undefined {
    const name = ch.name().toLowerCase();
    const old = this.allChannels.get(name);
    this.allChannels.set(name, ch);
    return old;
  }

  del(name: string): void {
    this.allChannels.delete(name.toLowerCase());
  }

  channel(name: string): Channel | undefined {
    return this.allChannels.get(name.toLowerCase());
  }

  all(): Channel[] {
    return Array.from(this.allChannels.values());
  }

  allByType(type: ChannelType): Channel[] {
    return Array.from(this.allChannels.values())
      .filter(ch => ch.type() === type);
  }

  clear(): void {
    this.allChannels.clear();
  }

  size(): number {
    return this.allChannels.size;
  }
}

export function initAlertMgrFromConfig(alertConfig: AlertConfig) {
  const config = alertConfig || {};
  const customTags = config.customTags || ["dev"];

  for (const [chId, chConfig] of Object.entries(config.channels)) {
    try {
      if (!chConfig.enable) {
        continue;
      }

      const channel = initAlertChannel(
        chId,
        chConfig,
        customTags
      );

      if (channel) {
        defaultManager().add(channel);
        logger.info("Succeed to init alert channel", { chId });
      }
    } catch (error) {
      logger.error("Failed to parse alert channel", { chId, error });
      throw error;
    }
  }

  if (!defaultManager().size()) {
    logger.warn("No channels configured in alert config");
  }
}

function initAlertChannel(
  chId: string,
  chConfig: DingTalkConfig | TelegramConfig,
  customTags: string[]
): Channel | null {
  const platform = chConfig["type"] as string;

  if (!platform) {
    throw new ChannelTypeNotSupportedError("undefined");
  }

  switch (platform.toLowerCase()) {
    case "dingtalk":
      return initDingTalkChannel(chId, chConfig as DingTalkConfig, customTags);
    case "telegram":
      return initTelegramChannel(chId, chConfig as TelegramConfig, customTags);
    default:
      throw new ChannelTypeNotSupportedError(platform);
  }
}

function initDingTalkChannel(
  chId: string,
  chConfig: DingTalkConfig,
  customTags: string[]
): DingTalkChannel {
  const formatter = createDingtalkMsgFormatter(
    chConfig.msgType!,
    customTags,
    chConfig.atMobiles
  );

  return new DingTalkChannel(chId, formatter, chConfig);
}

function initTelegramChannel(
  chId: string,
  chConfig: TelegramConfig,
  customTags: string[]
): TelegramChannel {
  const formatter = new TelegramMarkdownFormatter(customTags, chConfig.atUsers);

  return new TelegramChannel(chId, formatter, chConfig);
}
