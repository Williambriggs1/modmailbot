const bot = require("./bot");
const config = require("./cfg");
const { StarberryCaptureService } = require("./starberryCapture");

const SITE_URL = process.env.STARBERRY_SITE_URL || "https://starberrysmp.com";
const STARBERRY_DESCRIPTION_PREFIX = "Starberry:";
const STRING_OPTION = 3;

const INFO_COMMANDS = [
  { name: "alts", description: `${STARBERRY_DESCRIPTION_PREFIX} Show the alternate-account rule.` },
  {
    name: "rule",
    description: `${STARBERRY_DESCRIPTION_PREFIX} Show a StarberrySMP server rule.`,
    options: [{
      type: STRING_OPTION,
      name: "rule",
      description: "Rule name or keyword, such as griefing, scamming, or alts",
      required: true,
    }],
  },
  { name: "join", description: `${STARBERRY_DESCRIPTION_PREFIX} Show Java and Bedrock joining information.` },
  {
    name: "skill",
    description: `${STARBERRY_DESCRIPTION_PREFIX} Show information about a Starberry skill.`,
    options: [{
      type: STRING_OPTION,
      name: "skill",
      description: "Choose a skill",
      required: true,
      choices: [
        { name: "Farming", value: "farming" },
        { name: "Mining", value: "mining" },
        { name: "Foraging", value: "foraging" },
        { name: "Fishing", value: "fishing" },
      ],
    }],
  },
  {
    name: "crop",
    description: `${STARBERRY_DESCRIPTION_PREFIX} Show information about a custom crop.`,
    options: [{
      type: STRING_OPTION,
      name: "crop",
      description: "Custom crop name, such as Starberry or Tomato",
      required: true,
    }],
  },
  {
    name: "food",
    description: `${STARBERRY_DESCRIPTION_PREFIX} Show a custom food or recipe.`,
    options: [{
      type: STRING_OPTION,
      name: "food",
      description: "Food name, such as Burger or Starberry Pie",
      required: true,
    }],
  },
  { name: "economy", description: `${STARBERRY_DESCRIPTION_PREFIX} Show the Starberry economy overview.` },
  { name: "bank", description: `${STARBERRY_DESCRIPTION_PREFIX} Show the current Starberry bank information.` },
  {
    name: "rank",
    description: `${STARBERRY_DESCRIPTION_PREFIX} Show information about a player rank.`,
    options: [{
      type: STRING_OPTION,
      name: "rank",
      description: "Choose a rank",
      required: true,
      choices: [
        { name: "Seed", value: "seed" },
        { name: "Sprout", value: "sprout" },
        { name: "Bloom", value: "bloom" },
        { name: "Berry", value: "berry" },
        { name: "Starfruit", value: "starfruit" },
      ],
    }],
  },
  { name: "help", description: `${STARBERRY_DESCRIPTION_PREFIX} Show the Starberry informational commands.` },
];

const INFO_COMMAND_NAMES = new Set(INFO_COMMANDS.map(command => command.name));

function clean(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .slice(0, 80);
}

function getOption(interaction, name) {
  const options = interaction.data && Array.isArray(interaction.data.options)
    ? interaction.data.options
    : [];
  const option = options.find(item => item.name === name);
  return option ? clean(option.value) : "";
}

function commandFromInteraction(interaction) {
  switch (interaction.data.name) {
    case "alts": return { type: "rule", item: "alts" };
    case "rule": return { type: "rule", item: getOption(interaction, "rule") };
    case "join": return { type: "join", item: "" };
    case "skill": return { type: "skill", item: getOption(interaction, "skill") };
    case "crop": return { type: "crop", item: getOption(interaction, "crop") };
    case "food": return { type: "food", item: getOption(interaction, "food") };
    case "economy": return { type: "economy", item: "" };
    case "bank": return { type: "bank", item: "" };
    case "rank": return { type: "rank", item: getOption(interaction, "rank") };
    default: return null;
  }
}

function captureUrl(command) {
  const url = new URL(SITE_URL);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("capture", command.type);
  if (command.item) url.searchParams.set("item", command.item);
  return url.toString();
}

function guideUrl(command) {
  const paths = {
    rule: "/rules/",
    join: "/join/",
    skill: "/skills/",
    crop: "/crops/",
    food: "/food/",
    economy: "/economy/",
    bank: "/economy/",
    rank: "/ranks/",
  };
  return new URL(paths[command.type] || "/", SITE_URL).toString();
}

function sourceButton(url) {
  return [{
    type: 1,
    components: [{ type: 2, style: 5, label: "Open the Forest Guide", url }],
  }];
}

function helpPayload() {
  return {
    embeds: [{
      title: "🍓 StarberrySMP Information Commands",
      description: "Quick answers powered by the live StarberrySMP Forest Guide.",
      fields: [
        { name: "/alts", value: "Alternate-account rule", inline: true },
        { name: "/rule <rule>", value: "Server rules", inline: true },
        { name: "/join", value: "Java & Bedrock join info", inline: true },
        { name: "/skill <skill>", value: "Farming, Mining, Foraging, Fishing", inline: true },
        { name: "/crop <crop>", value: "Custom crops", inline: true },
        { name: "/food <food>", value: "Foods and recipes", inline: true },
        { name: "/economy", value: "Economy overview", inline: true },
        { name: "/bank", value: "Bank information", inline: true },
        { name: "/rank <rank>", value: "Seed through Starfruit", inline: true },
      ],
      footer: { text: "StarberrySMP · starberrysmp.com" },
    }],
    components: sourceButton(new URL("/", SITE_URL).toString()),
    allowedMentions: { everyone: false, roles: false, users: false },
  };
}

function fallbackPayload(command, error) {
  const url = guideUrl(command);
  const details = process.env.NODE_ENV === "development" && error
    ? `\n\nRender error: \`${String(error.message || error).slice(0, 300)}\``
    : "";

  return {
    embeds: [{
      title: "🍓 StarberrySMP Forest Guide",
      description: `I couldn't render the image card, but the live guide is still available below.${details}`,
      url,
    }],
    components: sourceButton(url),
    allowedMentions: { everyone: false, roles: false, users: false },
  };
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

async function syncCommands(enabledByGuild) {
  const guildIds = Array.from(new Set(config.mainServerId || []));

  for (const guildId of guildIds) {
    const guild = await waitForGuild(guildId);
    if (! guild) {
      console.warn(`[STARBERRY INFO] Could not register slash commands: guild ${guildId} is unavailable.`);
      continue;
    }

    let existingCommands;
    try {
      existingCommands = await guild.getCommands();
    } catch (err) {
      console.warn(`[STARBERRY INFO] Could not read slash commands for ${guild.name}: ${err.message}`);
      continue;
    }

    const enabledNames = new Set();
    for (const definition of INFO_COMMANDS) {
      const existing = existingCommands.find(command => command.name === definition.name && command.type === 1);

      try {
        if (existing) {
          if (! String(existing.description || "").startsWith(STARBERRY_DESCRIPTION_PREFIX)) {
            console.warn(`[STARBERRY INFO] Skipping /${definition.name} in ${guild.name}; another command already uses that name.`);
            continue;
          }
          await guild.editCommand(existing.id, definition);
        } else {
          await guild.createCommand(definition);
        }
        enabledNames.add(definition.name);
      } catch (err) {
        console.warn(`[STARBERRY INFO] Failed to register /${definition.name} in ${guild.name}: ${err.message}`);
      }
    }

    enabledByGuild.set(guildId, enabledNames);
    console.log(`[STARBERRY INFO] Registered ${enabledNames.size}/${INFO_COMMANDS.length} slash commands in ${guild.name}.`);
  }
}

function initStarberryInfo() {
  const captures = new StarberryCaptureService({ cacheMinutes: 10 });
  const enabledByGuild = new Map();

  bot.once("ready", () => {
    syncCommands(enabledByGuild).catch(err => {
      console.error(`[STARBERRY INFO] Slash-command sync failed: ${err.stack || err}`);
    });
  });

  bot.on("interactionCreate", async interaction => {
    if (interaction.type !== 2 || ! interaction.data || ! INFO_COMMAND_NAMES.has(interaction.data.name)) return;

    const enabledNames = enabledByGuild.get(interaction.guildID);
    if (! enabledNames || ! enabledNames.has(interaction.data.name)) return;

    if (interaction.data.name === "help") {
      try {
        await interaction.createMessage(helpPayload());
      } catch (err) {
        console.warn(`[STARBERRY INFO] Failed to answer /help: ${err.message}`);
      }
      return;
    }

    const command = commandFromInteraction(interaction);
    if (! command) return;

    try {
      await interaction.defer();
    } catch (err) {
      console.warn(`[STARBERRY INFO] Could not defer /${interaction.data.name}: ${err.message}`);
      return;
    }

    const cardUrl = captureUrl(command);
    const liveGuide = guideUrl(command);

    try {
      const buffer = await captures.screenshot(cardUrl);
      await interaction.editMessage(
        "@original",
        {
          content: "",
          components: sourceButton(liveGuide),
          allowedMentions: { everyone: false, roles: false, users: false },
        },
        {
          file: buffer,
          name: `starberry-${command.type}${command.item ? `-${command.item.replace(/\s+/g, "-")}` : ""}.png`,
        },
      );
    } catch (err) {
      console.warn(`[STARBERRY INFO] Screenshot failed for ${cardUrl}: ${err.message}`);
      await interaction.editMessage("@original", fallbackPayload(command, err)).catch(console.warn);
    }
  });

  process.once("beforeExit", () => captures.close());
}

module.exports = { initStarberryInfo };
