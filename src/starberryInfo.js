const bot = require("./bot");
const config = require("./cfg");
const { StarberryDataService, SITE_URL } = require("./starberryData");

const STARBERRY_DESCRIPTION_PREFIX = "Starberry:";
const STRING_OPTION = 3;
const EMBED_COLOR = 0xE56F86;

const INFO_COMMANDS = [
  { name: "alts", description: `${STARBERRY_DESCRIPTION_PREFIX} Show the alternate-account rule.` },
  { name: "rules", description: `${STARBERRY_DESCRIPTION_PREFIX} List the StarberrySMP server rules.` },
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
  { name: "skills", description: `${STARBERRY_DESCRIPTION_PREFIX} List all Starberry skills.` },
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
  { name: "crops", description: `${STARBERRY_DESCRIPTION_PREFIX} List all custom crops.` },
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
  { name: "foods", description: `${STARBERRY_DESCRIPTION_PREFIX} List all custom foods and recipes.` },
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
  { name: "ranks", description: `${STARBERRY_DESCRIPTION_PREFIX} List all Starberry player ranks.` },
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
const CONFIGURED_GUILDS = new Set(config.mainServerId || []);

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
    case "rules": return { type: "rules", item: "" };
    case "rule": return { type: "rule", item: getOption(interaction, "rule") };
    case "join": return { type: "join", item: "" };
    case "skills": return { type: "skills", item: "" };
    case "skill": return { type: "skill", item: getOption(interaction, "skill") };
    case "crops": return { type: "crops", item: "" };
    case "crop": return { type: "crop", item: getOption(interaction, "crop") };
    case "foods": return { type: "foods", item: "" };
    case "food": return { type: "food", item: getOption(interaction, "food") };
    case "economy": return { type: "economy", item: "" };
    case "bank": return { type: "bank", item: "" };
    case "ranks": return { type: "ranks", item: "" };
    case "rank": return { type: "rank", item: getOption(interaction, "rank") };
    default: return null;
  }
}

function guideUrl(command) {
  const paths = {
    rule: "/rules/",
    rules: "/rules/",
    join: "/join/",
    skill: "/skills/",
    skills: "/skills/",
    crop: "/crops/",
    crops: "/crops/",
    food: "/food/",
    foods: "/food/",
    economy: "/economy/",
    bank: "/economy/",
    rank: "/ranks/",
    ranks: "/ranks/",
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
      color: EMBED_COLOR,
      title: "🍓 StarberrySMP Information Commands",
      description: "Quick answers powered by the live StarberrySMP Forest Guide.",
      fields: [
        { name: "/alts · /rules · /rule", value: "Alternate-account rule, rule list, and individual rule details", inline: false },
        { name: "/join", value: "Java & Bedrock join information", inline: true },
        { name: "/skills · /skill", value: "List skills or view one skill", inline: true },
        { name: "/crops · /crop", value: "List crops or view one crop", inline: true },
        { name: "/foods · /food", value: "List foods or view one recipe", inline: true },
        { name: "/economy · /bank", value: "Economy and bank information", inline: true },
        { name: "/ranks · /rank", value: "List ranks or view one rank", inline: true },
      ],
      footer: { text: "StarberrySMP · Forest Guide" },
    }],
    components: sourceButton(new URL("/", SITE_URL).toString()),
    allowedMentions: { everyone: false, roles: false, users: false },
  };
}

function unavailablePayload(command) {
  const url = guideUrl(command);
  return {
    embeds: [{
      color: EMBED_COLOR,
      title: "🍓 StarberrySMP Forest Guide",
      description: "I couldn't load the live Forest Guide data just now. You can still open the guide below.",
      url,
      footer: { text: "StarberrySMP · Forest Guide" },
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
  const guildIds = Array.from(CONFIGURED_GUILDS);

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
  const data = new StarberryDataService();
  // Start permissive for our configured guilds so commands invoked during startup sync are still answered.
  const enabledByGuild = new Map(
    Array.from(CONFIGURED_GUILDS).map(guildId => [guildId, new Set(INFO_COMMAND_NAMES)]),
  );

  bot.once("ready", () => {
    syncCommands(enabledByGuild).catch(err => {
      console.error(`[STARBERRY INFO] Slash-command sync failed: ${err.stack || err}`);
    });

    data.warm()
      .then(() => console.log("[STARBERRY INFO] Live Forest Guide data cached."))
      .catch(err => console.warn(`[STARBERRY INFO] Initial Forest Guide cache failed: ${err.message}`));
  });

  bot.on("interactionCreate", async interaction => {
    if (interaction.type !== 2 || ! interaction.data || ! INFO_COMMAND_NAMES.has(interaction.data.name)) return;
    if (! interaction.guildID || ! CONFIGURED_GUILDS.has(interaction.guildID)) return;

    const enabledNames = enabledByGuild.get(interaction.guildID);
    if (enabledNames && ! enabledNames.has(interaction.data.name)) return;

    // Acknowledge immediately so Discord never times out while live website data is being fetched.
    try {
      await interaction.acknowledge();
    } catch (err) {
      console.warn(`[STARBERRY INFO] Could not acknowledge /${interaction.data.name}: ${err.message}`);
      return;
    }

    if (interaction.data.name === "help") {
      await interaction.editOriginalMessage(helpPayload()).catch(err => {
        console.warn(`[STARBERRY INFO] Failed to answer /help: ${err.message}`);
      });
      return;
    }

    const command = commandFromInteraction(interaction);
    if (! command) {
      await interaction.editOriginalMessage({ content: "That Starberry command could not be resolved." }).catch(console.warn);
      return;
    }

    const liveGuide = guideUrl(command);

    try {
      const embed = await data.buildEmbed(command, liveGuide);
      const payload = embed
        ? {
          embeds: [embed],
          components: sourceButton(liveGuide),
          allowedMentions: { everyone: false, roles: false, users: false },
        }
        : unavailablePayload(command);

      await interaction.editOriginalMessage(payload);
    } catch (err) {
      console.warn(`[STARBERRY INFO] Failed to answer /${interaction.data.name}: ${err.message}`);
      await interaction.editOriginalMessage(unavailablePayload(command)).catch(console.warn);
    }
  });
}

module.exports = { initStarberryInfo };
