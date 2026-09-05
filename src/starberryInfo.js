const bot = require("./bot");
const config = require("./cfg");

const SITE_URL = process.env.STARBERRY_SITE_URL || "https://starberrysmp.com";
const MANIFEST_URL = process.env.STARBERRY_API_MANIFEST
  || new URL("/api/v1/manifest.json", SITE_URL).toString();
const DEFAULT_OWNER_PREFIX = "Starberry:";
const CONFIGURED_GUILDS = new Set(config.mainServerId || []);

let manifest = null;
let commandByName = new Map();
let commandSignature = "";
const enabledByGuild = new Map();
const resourceCache = new Map();

function absoluteUrl(path) {
  return new URL(path || "/", SITE_URL).toString();
}

function withCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("_starling", Date.now().toString());
  return parsed.toString();
}

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(withCacheBust(url), {
      cache: "no-store",
      headers: {
        "accept": "application/json",
        "user-agent": "StarberrySMP-Starling/2.0",
      },
      signal: controller.signal,
    });
    if (! response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validateManifest(value) {
  if (! value || typeof value !== "object") throw new Error("API manifest is not an object");
  if (! Number.isInteger(value.api_version)) throw new Error("API manifest is missing api_version");
  if (! value.resources || typeof value.resources !== "object") throw new Error("API manifest is missing resources");
  if (! Array.isArray(value.commands)) throw new Error("API manifest is missing commands");

  for (const command of value.commands) {
    if (! command || typeof command !== "object" || ! command.name || ! command.description || ! command.action) {
      throw new Error("API manifest contains an invalid command definition");
    }
  }
}

function discordDefinition(command) {
  const definition = {
    name: command.name,
    description: command.description,
  };
  if (Array.isArray(command.options) && command.options.length) definition.options = command.options;
  return definition;
}

async function refreshManifest() {
  const next = await fetchJson(MANIFEST_URL);
  validateManifest(next);

  const nextSignature = JSON.stringify(next.commands.map(discordDefinition));
  const changed = nextSignature !== commandSignature;

  manifest = next;
  commandByName = new Map(next.commands.map(command => [command.name, command]));
  commandSignature = nextSignature;
  resourceCache.clear();

  return changed;
}

function syncDelayMs() {
  const seconds = Number(manifest?.sync_interval_seconds || 300);
  return Math.max(60, Math.min(seconds, 3600)) * 1000;
}

async function waitForGuild(guildId, timeoutMs = 15000) {
  if (bot.guilds.has(guildId)) return bot.guilds.get(guildId);

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      bot.removeListener("guildAvailable", onGuildAvailable);
      resolve(null);
    }, timeoutMs);

    function onGuildAvailable(guild) {
      if (guild.id !== guildId) return;
      clearTimeout(timer);
      bot.removeListener("guildAvailable", onGuildAvailable);
      resolve(guild);
    }

    bot.on("guildAvailable", onGuildAvailable);
  });
}

function isOwnedCommand(command, ownerPrefix) {
  const description = String(command.description || "");
  return description.startsWith(ownerPrefix || DEFAULT_OWNER_PREFIX)
    || description.startsWith(DEFAULT_OWNER_PREFIX);
}

async function syncCommands() {
  if (! manifest) return;

  const ownerPrefix = manifest.ownership_prefix || DEFAULT_OWNER_PREFIX;
  const wantedNames = new Set(manifest.commands.map(command => command.name));

  for (const guildId of CONFIGURED_GUILDS) {
    const guild = await waitForGuild(guildId);
    if (! guild) {
      console.warn(`[STARBERRY API] Could not sync slash commands: guild ${guildId} is unavailable.`);
      continue;
    }

    let existingCommands;
    try {
      existingCommands = await guild.getCommands();
    } catch (err) {
      console.warn(`[STARBERRY API] Could not read slash commands for ${guild.name}: ${err.message}`);
      continue;
    }

    const enabled = new Set();

    for (const command of manifest.commands) {
      const definition = discordDefinition(command);
      const existing = existingCommands.find(item => item.name === command.name && item.type === 1);

      try {
        if (existing) {
          if (! isOwnedCommand(existing, ownerPrefix)) {
            console.warn(`[STARBERRY API] Skipping /${command.name} in ${guild.name}; another command already owns that name.`);
            continue;
          }
          await guild.editCommand(existing.id, definition);
        } else {
          await guild.createCommand(definition);
        }
        enabled.add(command.name);
      } catch (err) {
        console.warn(`[STARBERRY API] Failed to sync /${command.name} in ${guild.name}: ${err.message}`);
      }
    }

    for (const existing of existingCommands) {
      if (existing.type !== 1 || wantedNames.has(existing.name) || ! isOwnedCommand(existing, ownerPrefix)) continue;
      try {
        await guild.deleteCommand(existing.id);
        console.log(`[STARBERRY API] Removed retired /${existing.name} command from ${guild.name}.`);
      } catch (err) {
        console.warn(`[STARBERRY API] Could not remove retired /${existing.name}: ${err.message}`);
      }
    }

    enabledByGuild.set(guildId, enabled);
    console.log(`[STARBERRY API] Synced ${enabled.size}/${manifest.commands.length} slash commands in ${guild.name}.`);
  }
}

function getPath(object, path) {
  if (! path) return object;
  return String(path).split(".").reduce((value, key) => {
    if (value == null) return undefined;
    return value[key];
  }, object);
}

function isEmpty(value) {
  return value == null
    || value === ""
    || (Array.isArray(value) && value.length === 0);
}

function scalar(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(item => scalar(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderTemplate(template, data) {
  return String(template || "").replace(/\{([^{}]+)\}/g, (match, path) => {
    const value = getPath(data, path.trim());
    return isEmpty(value) ? "" : scalar(value);
  });
}

function limit(value, max) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function renderValue(spec, data) {
  if (typeof spec === "string") return renderTemplate(spec, data);

  let value;
  if (spec.template != null) {
    value = renderTemplate(spec.template, data);
  } else {
    value = getPath(data, spec.path);
    if (isEmpty(value) && spec.fallback_path) value = getPath(data, spec.fallback_path);
  }

  if (isEmpty(value)) return "";

  switch (spec.format) {
    case "italic":
      return `*${scalar(value)}*`;
    case "comma_list":
      return Array.isArray(value) ? value.map(item => scalar(item)).join(", ") : scalar(value);
    case "bullets":
      return Array.isArray(value)
        ? value.map(item => `✦ ${scalar(item)}`).join("\n")
        : `✦ ${scalar(value)}`;
    case "recipe":
      return Array.isArray(value)
        ? value.map(item => `${item.icon ? `${item.icon} ` : ""}${item.amount ?? 1}× ${item.name ?? scalar(item)}`).join(" + ")
        : scalar(value);
    case "milestones":
      return Array.isArray(value)
        ? value.map(item => `**Level ${item.level}:** ${item.reward}`).join("\n")
        : scalar(value);
    case "lines":
      return Array.isArray(value) ? value.map(item => scalar(item)).join("\n") : scalar(value);
    default:
      return scalar(value);
  }
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function htmlToText(value) {
  return decodeEntities(String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeArrayRecord(record, resource) {
  const copy = { ...record };
  const idField = resource.id_field || "id";
  const nameField = resource.name_field || "name";
  const iconField = resource.icon_field || "icon";

  if (copy.id == null) copy.id = getPath(record, idField);
  if (copy.name == null) copy.name = getPath(record, nameField);
  if (copy.icon == null) copy.icon = getPath(record, iconField) || resource.icon || "✦";

  return copy;
}

function normalizeHtmlRules(raw, resource) {
  const sections = getPath(raw, resource.path) || [];
  const records = [];

  for (const section of sections) {
    const html = String(section.html || "");
    const matches = html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi);

    for (const match of matches) {
      const itemHtml = match[1];
      const strongMatch = itemHtml.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
      const heading = htmlToText(strongMatch ? strongMatch[1] : itemHtml.split(".")[0]);
      let description = htmlToText(itemHtml);
      description = description
        .replace(new RegExp(`^${escapeRegex(heading)}[:.]?\\s*`, "i"), "")
        .trim();

      records.push({
        id: slug(heading),
        name: heading,
        icon: resource.icon || "📜",
        description,
        section: String(section.title || "Server Rules").trim(),
      });
    }
  }

  return records;
}

function normalizeResource(raw, resource) {
  switch (resource.kind) {
    case "array":
      return Array.isArray(raw) ? raw.map(record => normalizeArrayRecord(record, resource)) : [];
    case "html_rules":
      return normalizeHtmlRules(raw, resource);
    case "object":
    default:
      return raw;
  }
}

async function loadResource(name) {
  if (! manifest) throw new Error("Forest Guide API manifest is unavailable");

  const resource = manifest.resources[name];
  if (! resource || ! resource.url) throw new Error(`Unknown API resource: ${name}`);

  const cacheSeconds = Math.max(0, Number(manifest.resource_cache_seconds || 0));
  const cached = resourceCache.get(name);
  if (cached && Date.now() - cached.fetchedAt <= cacheSeconds * 1000) return cached.data;

  const raw = await fetchJson(absoluteUrl(resource.url));
  const data = normalizeResource(raw, resource);

  if (cacheSeconds > 0) resourceCache.set(name, { data, fetchedAt: Date.now() });
  return data;
}

function getOption(interaction, name) {
  const options = Array.isArray(interaction.data?.options) ? interaction.data.options : [];
  const option = options.find(item => item.name === name);
  return option?.value == null ? "" : String(option.value).trim();
}

function searchableText(record, resource) {
  const fields = Array.isArray(resource.search_fields) && resource.search_fields.length
    ? resource.search_fields
    : ["id", "name"];

  return fields
    .map(path => scalar(getPath(record, path)))
    .join(" ")
    .toLowerCase();
}

function findRecord(records, query, resource) {
  if (! Array.isArray(records)) return null;
  const rawQuery = String(query || "").trim().toLowerCase();
  const querySlug = slug(rawQuery);

  let best = null;
  let bestScore = -1;

  for (const record of records) {
    const id = String(record.id || "").toLowerCase();
    const name = String(record.name || "").toLowerCase();
    const nameSlug = slug(name);
    const haystack = searchableText(record, resource);

    let score = 0;
    if (id === rawQuery || id === querySlug || name === rawQuery || nameSlug === querySlug) score = 100;
    else if (id.startsWith(rawQuery) || name.startsWith(rawQuery) || nameSlug.startsWith(querySlug)) score = 80;
    else if (id.includes(rawQuery) || name.includes(rawQuery) || nameSlug.includes(querySlug)) score = 65;
    else if (haystack.includes(rawQuery)) score = 45;
    else continue;

    if (score > bestScore) {
      bestScore = score;
      best = record;
    }
  }

  return best;
}

function brandColor() {
  const color = Number(manifest?.brand?.color);
  return Number.isInteger(color) ? color : 0xE56F86;
}

function brandFooter() {
  return manifest?.brand?.footer || "StarberrySMP · Forest Guide";
}

function sourceButton(url) {
  return [{
    type: 1,
    components: [{ type: 2, style: 5, label: "Open the Forest Guide", url }],
  }];
}

function baseEmbed(title, description, url) {
  return {
    color: brandColor(),
    title: limit(title || "🍓 StarberrySMP", 256),
    description: limit(description || "Live information from the StarberrySMP Forest Guide.", 4096),
    url,
    footer: { text: limit(brandFooter(), 2048) },
  };
}

function renderEmbed(command, subject) {
  const guide = absoluteUrl(command.guide_url || "/");
  const spec = command.embed || {};
  const mode = command.action?.mode;

  if (mode === "list") {
    const records = Array.isArray(subject) ? subject : [];
    const template = spec.list_template || "{icon} **{name}**";
    const lines = records.map(record => renderTemplate(template, record)).filter(Boolean);
    const description = [spec.hint, lines.join("\n")].filter(Boolean).join("\n\n");
    const embed = baseEmbed(spec.title || "🍓 StarberrySMP", description, guide);
    if (spec.show_total) embed.fields = [{ name: "Total", value: String(records.length), inline: true }];
    return embed;
  }

  if (mode === "help") {
    const lines = manifest.commands
      .filter(item => item.name !== command.name && item.action?.mode !== "help")
      .map(item => {
        const description = String(item.description || "").replace(/^Starberry:\s*/i, "");
        const optionNames = Array.isArray(item.options)
          ? item.options.filter(option => option.required).map(option => ` <${option.name}>`).join("")
          : "";
        return `**/${item.name}${optionNames}** — ${description}`;
      });

    const description = [
      typeof spec.description === "string" ? spec.description : "",
      lines.join("\n"),
    ].filter(Boolean).join("\n\n");

    return baseEmbed(spec.title || "🍓 StarberrySMP Information Commands", description, guide);
  }

  const title = renderTemplate(spec.title || "🍓 StarberrySMP", subject);
  let description = "";

  if (Array.isArray(spec.description)) {
    description = spec.description
      .map(item => renderValue(item, subject))
      .filter(Boolean)
      .join("\n\n");
  } else if (spec.description) {
    description = renderValue(spec.description, subject);
  }

  const embed = baseEmbed(title, description, guide);
  const fields = [];

  for (const field of spec.fields || []) {
    const value = renderValue(field, subject);
    if (! value && field.omit_if_empty) continue;
    fields.push({
      name: limit(field.name || "Info", 256),
      value: limit(value || "—", 1024),
      inline: Boolean(field.inline),
    });
  }

  if (fields.length) embed.fields = fields.slice(0, 25);
  return embed;
}

function unavailablePayload(command, message = "I couldn't load the live Forest Guide API just now.") {
  const url = absoluteUrl(command?.guide_url || "/");
  return {
    embeds: [baseEmbed("🍓 StarberrySMP Forest Guide", message, url)],
    components: sourceButton(url),
    allowedMentions: { everyone: false, roles: false, users: false },
  };
}

async function resolveCommand(command, interaction) {
  const action = command.action || {};

  if (action.mode === "help") return null;

  const resource = manifest.resources[action.resource];
  if (! resource) throw new Error(`Command /${command.name} references unknown resource ${action.resource}`);

  const data = await loadResource(action.resource);

  if (action.mode === "list") return data;

  if (action.mode === "object") {
    return action.path ? getPath(data, action.path) : data;
  }

  if (action.mode === "lookup") {
    const query = action.fixed_query || getOption(interaction, action.query_option);
    const record = findRecord(data, query, resource);
    if (! record) {
      return {
        __notFound: true,
        query,
        resourceName: action.resource,
      };
    }
    return record;
  }

  throw new Error(`Unsupported API command mode: ${action.mode}`);
}

function notFoundEmbed(command, result) {
  const label = String(result.resourceName || "entry").replace(/[-_]/g, " ");
  return baseEmbed(
    "🔎 Nothing found",
    `I couldn't find a ${label.replace(/s$/, "")} matching **${result.query || "that search"}**.`,
    absoluteUrl(command.guide_url || "/"),
  );
}

async function handleAutocomplete(interaction) {
  const command = commandByName.get(interaction.data?.name);
  if (! command) return;

  const focused = (interaction.data.options || []).find(option => option.focused);
  const action = command.action || {};

  if (! focused || action.mode !== "lookup" || ! action.resource) {
    await interaction.result([]).catch(() => {});
    return;
  }

  try {
    const resource = manifest.resources[action.resource];
    const records = await loadResource(action.resource);
    const query = String(focused.value || "").trim().toLowerCase();

    const choices = (Array.isArray(records) ? records : [])
      .map(record => {
        const haystack = searchableText(record, resource);
        const name = String(record.name || record.id || "").trim();
        const id = String(record.id || record.name || "").trim();
        let score = 1;

        if (query) {
          const lowerName = name.toLowerCase();
          const lowerId = id.toLowerCase();
          if (lowerName === query || lowerId === query) score = 100;
          else if (lowerName.startsWith(query) || lowerId.startsWith(query)) score = 80;
          else if (lowerName.includes(query) || lowerId.includes(query)) score = 60;
          else if (haystack.includes(query)) score = 40;
          else return null;
        }

        return {
          score,
          choice: {
            name: limit(`${record.icon ? `${record.icon} ` : ""}${name}`, 100),
            value: limit(id, 100),
          },
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.choice.name.localeCompare(b.choice.name))
      .slice(0, 25)
      .map(item => item.choice);

    await interaction.result(choices);
  } catch (err) {
    console.warn(`[STARBERRY API] Autocomplete failed for /${interaction.data?.name}: ${err.message}`);
    await interaction.result([]).catch(() => {});
  }
}

async function handleCommand(interaction) {
  const command = commandByName.get(interaction.data?.name);
  if (! command) return;
  if (! interaction.guildID || ! CONFIGURED_GUILDS.has(interaction.guildID)) return;

  const enabled = enabledByGuild.get(interaction.guildID);
  if (enabled && ! enabled.has(command.name)) return;

  // Always acknowledge first; website/API fetches happen only after Discord has received the response.
  try {
    await interaction.acknowledge();
  } catch (err) {
    console.warn(`[STARBERRY API] Could not acknowledge /${command.name}: ${err.message}`);
    return;
  }

  try {
    let subject;
    if (command.action?.mode !== "help") subject = await resolveCommand(command, interaction);

    const embed = subject?.__notFound
      ? notFoundEmbed(command, subject)
      : renderEmbed(command, subject);

    await interaction.editOriginalMessage({
      embeds: [embed],
      components: sourceButton(absoluteUrl(command.guide_url || "/")),
      allowedMentions: { everyone: false, roles: false, users: false },
    });
  } catch (err) {
    console.warn(`[STARBERRY API] Failed to answer /${command.name}: ${err.message}`);
    await interaction.editOriginalMessage(unavailablePayload(command)).catch(console.warn);
  }
}

function scheduleManifestRefresh() {
  setTimeout(async () => {
    try {
      const changed = await refreshManifest();
      if (changed) {
        console.log("[STARBERRY API] Manifest changed; syncing slash commands.");
        await syncCommands();
      }
    } catch (err) {
      console.warn(`[STARBERRY API] Manifest refresh failed: ${err.message}`);
    } finally {
      scheduleManifestRefresh();
    }
  }, syncDelayMs());
}

function initStarberryInfo() {
  // Fetch before Discord is ready so existing slash commands can be answered immediately after connect.
  const initialManifest = refreshManifest()
    .then(() => {
      console.log(`[STARBERRY API] Loaded API v${manifest.api_version} from ${MANIFEST_URL}.`);
      return true;
    })
    .catch(err => {
      console.warn(`[STARBERRY API] Initial manifest load failed: ${err.message}`);
      return false;
    });

  bot.once("ready", async () => {
    const loaded = await initialManifest;
    if (! loaded) {
      try {
        await refreshManifest();
        console.log(`[STARBERRY API] Loaded API v${manifest.api_version} on retry.`);
      } catch (err) {
        console.warn(`[STARBERRY API] Manifest retry failed: ${err.message}`);
        scheduleManifestRefresh();
        return;
      }
    }

    await syncCommands().catch(err => {
      console.error(`[STARBERRY API] Slash-command sync failed: ${err.stack || err}`);
    });

    scheduleManifestRefresh();
  });

  bot.on("interactionCreate", interaction => {
    if (! manifest || ! interaction?.data?.name) return;

    if (interaction.type === 4) {
      handleAutocomplete(interaction);
      return;
    }

    if (interaction.type === 2) handleCommand(interaction);
  });
}

module.exports = { initStarberryInfo };
