# Starberry informational slash commands

Starling now combines Modmail/applications with public StarberrySMP information commands.

## Commands

- `/alts` — alternate-account rule
- `/rule <rule>` — server rule by name or keyword
- `/join` — Java and Bedrock joining information
- `/skill <skill>` — Farming, Mining, Foraging, or Fishing
- `/crop <crop>` — custom crop information
- `/food <food>` — custom food / recipe information
- `/economy` — economy overview
- `/bank` — bank information
- `/rank <rank>` — Seed, Sprout, Bloom, Berry, or Starfruit
- `/help` — informational command list

Commands are registered as guild slash commands on every configured `mainServerId`, so they should appear shortly after Starling starts.

## Website integration

The live website remains the source of truth. Information cards are rendered from `https://starberrysmp.com/?capture=...`, so website content changes automatically flow into the Discord responses.

Set `STARBERRY_SITE_URL` only if the website base URL changes.

## Screenshot support

The bot tries, in order:

1. Puppeteer, if the `puppeteer` package is already installed.
2. A system Chromium / Chrome executable.
3. A normal Discord embed linking to the live Forest Guide if image rendering is unavailable.

Common Chromium paths are detected automatically. If Bloom provides Chromium somewhere else, set:

```bash
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium
```

This means lack of Chromium will not break Modmail, applications, or the informational commands; only the screenshot card falls back to a link.

## Discord bot authorization

The bot needs the `applications.commands` scope in addition to the normal `bot` scope for slash commands to be available. Existing permissions such as Send Messages, Embed Links, and Attach Files should remain enabled.
