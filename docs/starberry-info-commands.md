# Starberry informational slash commands

Starling combines Modmail/applications with public StarberrySMP information commands.

## Commands

- `/alts` — alternate-account rule
- `/rules` — list all server rules
- `/rule <rule>` — server rule by name or keyword
- `/join` — Java and Bedrock joining information
- `/skills` — list all skills
- `/skill <skill>` — Farming, Mining, Foraging, or Fishing
- `/crops` — list all custom crops
- `/crop <crop>` — custom crop information
- `/foods` — list all custom foods and recipes
- `/food <food>` — custom food / recipe information
- `/economy` — economy overview
- `/bank` — bank information
- `/ranks` — list all player ranks
- `/rank <rank>` — Seed, Sprout, Bloom, Berry, or Starfruit
- `/help` — informational command list

Commands are registered as guild slash commands on every configured `mainServerId`, so they should appear shortly after Starling starts.

## Website integration

The live website remains the source of truth. Starling reads the public JSON data under `https://starberrysmp.com/data/` and turns it into native Discord embeds.

Website data is cached for five minutes for fast responses. Once a cached dataset becomes stale, the next command attempts to refresh it from the live website before replying. This means changes to crops, foods, ranks, skills, rules, economy information, and server information flow into Discord automatically after the updated website data has deployed. A bot restart is not required for content-only changes.

Slash-command names and command structure are bot code, so adding or removing commands still requires a Starling code update/restart.

Set `STARBERRY_SITE_URL` only if the website base URL changes.

## Interaction reliability

Starling acknowledges informational slash commands immediately and then edits the original interaction response after loading the requested Forest Guide data. This prevents Discord's `The application did not respond` timeout while the website is being contacted.

## No Chromium required

The informational commands no longer use Puppeteer or Chromium. This avoids missing Linux-library errors on Bloom and keeps the commands lightweight.

You do not need `puppeteer` in Bloom's **Additional Node Packages** field, and you do not need `CHROMIUM_EXECUTABLE_PATH`.

## Discord bot authorization

The bot needs the `applications.commands` scope in addition to the normal `bot` scope for slash commands to be available. Existing permissions such as Send Messages and Embed Links should remain enabled.
