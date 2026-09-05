# Starberry informational slash commands

Starling combines Modmail/applications with public StarberrySMP information commands, but the informational system is now website-driven.

## API-driven architecture

Starling no longer stores Starberry rules, crops, foods, ranks, skills, economy details, server details, command lists, or embed layouts in the bot repository.

Instead it loads the public manifest from:

`https://starberrysmp.com/api/v1/manifest.json`

That manifest tells Starling:

- which slash commands should exist
- which website resource each command should query
- which options use autocomplete
- how list/detail responses should be rendered
- which Forest Guide page to link to
- Starberry embed branding

The manifest then points to the existing website JSON under `/data/`.

## Automatic updates

Content changes are automatic. If a crop, food, rank, skill, rule, economy value, or server value changes on the website, Starling reads the updated website data when the command is used.

Starling keeps resource responses only in a very short-lived RAM cache (currently 15 seconds) to avoid repeated requests during autocomplete. Nothing from the Forest Guide API is persisted to disk.

Command structure is automatic too. Starling checks the API manifest periodically (currently every 5 minutes). If a command is added, changed, or removed in the website manifest, Starling syncs Discord's slash commands without needing a source-code change or restart.

## Current commands

The current manifest defines:

- `/alts`
- `/rules` and `/rule <rule>`
- `/join`
- `/skills` and `/skill <skill>`
- `/crops` and `/crop <crop>`
- `/foods` and `/food <food>`
- `/economy` and `/bank`
- `/ranks` and `/rank <rank>`
- `/help`

Detail commands use live autocomplete from the matching website resource. New crops, foods, ranks, skills, and rules therefore become searchable without editing Starling.

## Adding future information

For normal entries such as a new crop or food, edit the matching website `/data/*.json` file only.

For a new type of informational slash command, add it to `/api/v1/manifest.json`. Starling supports generic `list`, `lookup`, `object`, and `help` command modes plus manifest-defined embed fields/templates.

The API format is documented in the website repository under `api/README.md`.

## Interaction reliability

Starling acknowledges slash commands before it performs website/API requests, then edits the original Discord response. This prevents Discord's `The application did not respond` timeout while live data is loading.

## No Chromium required

The informational commands do not use Puppeteer or Chromium. Do not add `puppeteer` to Bloom's **Additional Node Packages** field, and no `CHROMIUM_EXECUTABLE_PATH` is required.

If Puppeteer was previously installed on Bloom, remove it from Additional Node Packages. Its downloaded Chrome cache can also be deleted from the server files to reclaim disk space.

## Optional overrides

`STARBERRY_SITE_URL` changes the website base URL.

`STARBERRY_API_MANIFEST` can point Starling at a different manifest URL for testing or a future API version.

## Discord authorization

The bot needs the `applications.commands` scope in addition to the normal bot scope. Existing permissions such as Send Messages and Embed Links should remain enabled.
