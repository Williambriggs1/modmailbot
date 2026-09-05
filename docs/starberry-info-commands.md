# Starberry informational slash commands

Starling combines Modmail/applications with public StarberrySMP information commands.

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

The live website remains the source of truth. Starling reads the public JSON data under `https://starberrysmp.com/data/` and turns it into native Discord embeds.

The website data is cached for a few minutes for fast responses and refreshed automatically as commands are used. This means website content changes still flow into Discord without needing to duplicate the information in the bot.

Set `STARBERRY_SITE_URL` only if the website base URL changes.

## No Chromium required

The informational commands no longer use Puppeteer or Chromium. This avoids missing Linux-library errors on Bloom and keeps the commands lightweight.

You do not need `puppeteer` in Bloom's **Additional Node Packages** field, and you do not need `CHROMIUM_EXECUTABLE_PATH`.

## Discord bot authorization

The bot needs the `applications.commands` scope in addition to the normal `bot` scope for slash commands to be available. Existing permissions such as Send Messages and Embed Links should remain enabled.
