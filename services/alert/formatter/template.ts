const maxAlertMsgLength = 4096;

export const escapeMarkdown = (val: any) => {
  // Basic markdown escaping for Telegram
  const str = String(val);
  return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
};

export const formatRFC3339 = (t: Date) => {
  return t.toISOString();
};

export const toStr = (val: any) => {
  if (typeof val === "string") return val;
  return String(val);
};

export const truncateStringWithTail = (s: string) => {
  if (s.length > maxAlertMsgLength) {
    return s.substring(0, maxAlertMsgLength) + "...";
  }
  return s;
};

export const simpleTextTemplates = [
`
{{title}}

Tags: {{tags}}
Severity: {{severity}}
Time: {{formatRFC3339 time}}

{{content}}
{{#each (mentions)}}@{{this}}{{/each}}
`,
`
{{level}}

Tags: {{tags}}
Time: {{formatRFC3339 time}}

Message
{{msg}}

Reason
{{#with error}}{{.}}{{else}}N/A{{/with}}

{{#if ctxFields}}Context Fields{{#each ctxFields }}
{{@key}}: {{this}}{{/each}}{{/if}}
{{#each (mentions)}}@{{this}}{{/each}}
`
];

export const dingTalkMarkdownTemplates = [
`
# {{title}}

- **Tags**: {{tags}}
- **Severity**: {{severity}}
- **Time**: {{formatRFC3339 time}}

**{{content}}**
{{#each (mentions)}}@{{this}}{{/each}}
`,
`
# {{level}}

- **Tags**: {{tags}}
- **Time**: {{formatRFC3339 time}}

---

## Message
{{msg}}

{{#with error}}
---

## Reason
{{.}}
{{/with}}

{{#if ctxFields}}
---

## Context Fields

{{#each ctxFields}}
- **{{@key}}**: {{this}}
{{/each}}
{{/if}}
{{#each (mentions)}}@{{this}}{{/each}}
`
];

export const telegramMarkdownTemplates = [
`
*{{escapeMarkdown title}}*
*Tags*: {{escapeMarkdown tags}}
*Severity*: {{escapeMarkdown severity}}
*Time*: {{escapeMarkdown (formatRFC3339 time)}}
*{{escapeMarkdown (truncateStringWithTail content)}}*
{{#each (mentions)}}@{{this}} {{/each}}
`,
`
*{{escapeMarkdown level}}*
*Tags*: {{escapeMarkdown tags}}
*Time*: {{escapeMarkdown (formatRFC3339 time)}}

*Message*
{{escapeMarkdown (truncateStringWithTail msg)}}

{{#with error}}*Reason*
{{escapeMarkdown .}}

{{else}}{{/with}}{{#if ctxFields }}*Context Fields*:{{#each ctxFields}}
    *{{escapeMarkdown @key}}*: {{escapeMarkdown (truncateStringWithTail (toStr this))}}{{/each}}{{/if}}
{{#each (mentions)}}@{{this}}{{/each}}
`
];
