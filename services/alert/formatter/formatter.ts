import { severityToString, Notification, LogItem } from "./types";
import {
  dingTalkMarkdownTemplates, escapeMarkdown, formatRFC3339,
  simpleTextTemplates,
  telegramMarkdownTemplates, toStr, truncateStringWithTail
} from "./template";
import Handlebars from "handlebars";

export interface Formatter {
  format(note: Notification): string;
}

interface TplData {
  title?: string;
  tags?: string[];
  severity?: string;
  time?: Date;
  content?: any;
  level?: string;
  msg?: string;
  error?: Error | null;
  ctxFields?: Record<string, any>;
  mentions?: string[];
}

class TplFormatter implements Formatter {

  constructor(
    public tags: string[],
    public defaultTpl: HandlebarsTemplateDelegate,
    public logItemTpl: HandlebarsTemplateDelegate
  ) {
  }

  format(note: Notification): string {
    if (this.isLogItem(note.content)) {
      return this.formatLogItem(note);
    }
    return this.formatDefault(note);
  }

  private isLogItem(content: any): content is LogItem {
    return (content as LogItem)?.level !== undefined &&
      (content as LogItem)?.message !== undefined;
  }

  private formatLogItem(note: Notification): string {
    const entry = note.content as LogItem;
    const entryError = entry.error;

    const ctxFields: Record<string, any> = { ...entry.ctxFields };

    const data: TplData = {
      level: entry.level,
      tags: this.tags,
      time: entry.time,
      msg: entry.message,
      error: entryError,
      ctxFields: ctxFields
    };

    return this.logItemTpl(data);
  }

  private formatDefault(note: Notification): string {
    const data: TplData = {
      title: note.title,
      tags: this.tags,
      severity: severityToString(note.severity),
      time: new Date(),
      content: note.content
    };

    return this.defaultTpl(data);
  }
}

class MarkdownFormatter extends TplFormatter {
  constructor(
    public tags: string[],
    public helpers: Record<string, any>,
    public defaultStrTpl: string,
    public logItemStrTpl: string
  ) {
    const instance = Handlebars.create();
    Object.entries(helpers).forEach(([name, fn]) => {
      instance.registerHelper(name, fn);
    });
    super(
      tags,
      instance.compile(defaultStrTpl),
      instance.compile(logItemStrTpl)
    );
  }
}

export class DingTalkMarkdownFormatter implements Formatter {
  private formatter: MarkdownFormatter;

  constructor(tags: string[], mentions: string[]) {
    this.formatter = new MarkdownFormatter(
      tags,
      {
        formatRFC3339,
        mentions: () => {
          return mentions;
        }
      },
      dingTalkMarkdownTemplates[0],
      dingTalkMarkdownTemplates[1]
    );
  }

  format(note: Notification): string {
    return this.formatter.format(note);
  }
}

export class TelegramMarkdownFormatter implements Formatter {
  private formatter: MarkdownFormatter;

  constructor(tags: string[], mentions: string[]) {
    this.formatter = new MarkdownFormatter(
      tags,
      {
        toStr,
        escapeMarkdown,
        formatRFC3339,
        truncateStringWithTail,
        mentions: () => {
          return mentions;
        }
      },
      telegramMarkdownTemplates[0],
      telegramMarkdownTemplates[1]
    );
  }

  format(note: Notification): string {
    return this.formatter.format(note);
  }
}

export class SimpleTextFormatter implements Formatter {
  private formatter: TplFormatter;

  constructor(tags: string[], mentions: string[]) {
    const instance = Handlebars.create();
    Object.entries({
      formatRFC3339,
      mentions: () => {
        return mentions;
      }
    }).forEach(([name, fn]) => {
      instance.registerHelper(name, fn);
    });

    this.formatter = new TplFormatter(
      tags,
      instance.compile(simpleTextTemplates[0]),
      instance.compile(simpleTextTemplates[1])
    );
  }

  format(note: Notification): string {
    return this.formatter.format(note);
  }
}
