const SITE_URL = process.env.STARBERRY_SITE_URL || "https://starberrysmp.com";
const CACHE_MS = 5 * 60 * 1000;
const EMBED_COLOR = 0xE56F86;

const DATASETS = {
  pages: "/data/pages.json",
  server: "/data/server.json",
  skills: "/data/skills.json",
  crops: "/data/crops.json",
  foods: "/data/foods.json",
  economy: "/data/economy.json",
  ranks: "/data/ranks.json",
};

const RULE_ALIASES = {
  alt: "alternate-accounts",
  alts: "alternate-accounts",
  alternate: "alternate-accounts",
  grief: "no-griefing-or-stealing",
  griefing: "no-griefing-or-stealing",
  scam: "no-scamming",
  scamming: "no-scamming",
  lag: "do-not-intentionally-cause-lag",
  advertising: "no-spam-or-unauthorized-advertising",
  ads: "no-spam-or-unauthorized-advertising",
  doxxing: "protect-personal-information",
  exploits: "no-bugs-dupes-or-exploits",
  cheats: "no-unfair-advantages",
  rmt: "no-real-money-trading",
};

function limit(value, max = 1024) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text || "—";
  return `${text.slice(0, max - 1)}…`;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
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

function baseEmbed(title, description, url) {
  return {
    color: EMBED_COLOR,
    title: limit(title, 256),
    description: limit(description, 4096),
    url,
    footer: { text: "StarberrySMP · Forest Guide" },
  };
}

class StarberryDataService {
  constructor({ cacheMs = CACHE_MS } = {}) {
    this.cacheMs = cacheMs;
    this.cache = new Map();
    this.pending = new Map();
  }

  async fetchJson(name, timeoutMs = 4000) {
    const path = DATASETS[name];
    if (! path) throw new Error(`Unknown Starberry dataset: ${name}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(new URL(path, SITE_URL), {
        headers: { "user-agent": "StarberrySMP-Starling/1.0" },
        signal: controller.signal,
      });
      if (! response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
      const data = await response.json();
      this.cache.set(name, { data, fetchedAt: Date.now() });
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  refresh(name) {
    if (this.pending.has(name)) return this.pending.get(name);
    const request = this.fetchJson(name)
      .catch(err => {
        console.warn(`[STARBERRY INFO] Could not refresh ${name}: ${err.message}`);
        return this.cache.get(name)?.data || null;
      })
      .finally(() => this.pending.delete(name));
    this.pending.set(name, request);
    return request;
  }

  async warm() {
    await Promise.all(Object.keys(DATASETS).map(name => this.refresh(name)));
  }

  async get(name) {
    const hit = this.cache.get(name);
    if (hit) {
      if (Date.now() - hit.fetchedAt > this.cacheMs) this.refresh(name);
      return hit.data;
    }

    // Keep first-use latency low enough for Discord's interaction timeout.
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 1500));
    return Promise.race([this.refresh(name), timeout]);
  }

  findRule(pages, query) {
    const sections = pages?.rules?.sections || [];
    const rules = [];

    for (const section of sections) {
      const html = String(section.html || "");
      const matches = html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi);
      for (const match of matches) {
        const itemHtml = match[1];
        const strongMatch = itemHtml.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
        const heading = htmlToText(strongMatch ? strongMatch[1] : itemHtml.split(".")[0]);
        let body = htmlToText(itemHtml);
        body = body.replace(new RegExp(`^${escapeRegex(heading)}[:.]?\\s*`, "i"), "").trim();
        rules.push({
          heading,
          body,
          key: slug(heading),
          section: String(section.title || "Server Rules").trim(),
        });
      }
    }

    const wanted = RULE_ALIASES[query] || slug(query);
    return rules.find(rule => rule.key === wanted)
      || rules.find(rule => rule.key.includes(wanted))
      || rules.find(rule => wanted.includes(rule.key));
  }

  async buildEmbed(command, guideUrl) {
    switch (command.type) {
      case "rule": {
        const pages = await this.get("pages");
        if (! pages) return null;
        const rule = this.findRule(pages, command.item);
        if (! rule) return baseEmbed("📜 Rule not found", `I couldn't find a rule matching **${command.item}**.`, guideUrl);
        const embed = baseEmbed(`📜 ${rule.heading}`, rule.body, guideUrl);
        embed.fields = [{ name: "Section", value: limit(rule.section), inline: true }];
        return embed;
      }

      case "join": {
        const server = await this.get("server");
        if (! server) return null;
        const embed = baseEmbed("🌱 Join StarberrySMP", "Java & Bedrock crossplay information from the live Forest Guide.", guideUrl);
        embed.fields = [
          { name: "Java", value: limit(server.java_address), inline: true },
          { name: "Bedrock", value: limit(`${server.bedrock_address}\nPort ${server.bedrock_port}`), inline: true },
          { name: "Version", value: limit(server.version), inline: true },
        ];
        return embed;
      }

      case "skill": {
        const skills = await this.get("skills");
        if (! skills) return null;
        const skill = skills.find(item => item.id === command.item || slug(item.name) === slug(command.item));
        if (! skill) return baseEmbed("⭐ Skill not found", `I couldn't find a skill matching **${command.item}**.`, guideUrl);
        const embed = baseEmbed(`${skill.icon || "⭐"} ${skill.name}`, skill.description || skill.short_description, guideUrl);
        if (Array.isArray(skill.milestones) && skill.milestones.length) {
          embed.fields = [{
            name: "Milestones",
            value: limit(skill.milestones.map(item => `**Level ${item.level}:** ${item.reward}`).join("\n")),
          }];
        }
        return embed;
      }

      case "crop": {
        const crops = await this.get("crops");
        if (! crops) return null;
        const crop = crops.find(item => item.id === command.item || slug(item.name) === slug(command.item));
        if (! crop) return baseEmbed("🌱 Crop not found", `I couldn't find a crop matching **${command.item}**.`, guideUrl);
        const description = [crop.description, crop.lore ? `*${crop.lore}*` : ""].filter(Boolean).join("\n\n");
        const embed = baseEmbed(`${crop.icon || "🌱"} ${crop.name}`, description, guideUrl);
        embed.fields = [
          { name: "Growth", value: limit(crop.growth), inline: true },
          { name: "Harvest", value: limit(crop.harvest), inline: true },
          { name: "Used For", value: limit(Array.isArray(crop.uses) ? crop.uses.join(", ") : crop.uses), inline: false },
        ];
        return embed;
      }

      case "food": {
        const foods = await this.get("foods");
        if (! foods) return null;
        const food = foods.find(item => item.id === command.item || slug(item.name) === slug(command.item));
        if (! food) return baseEmbed("🍽️ Food not found", `I couldn't find a food matching **${command.item}**.`, guideUrl);
        const description = [food.description, food.lore ? `*${food.lore}*` : ""].filter(Boolean).join("\n\n");
        const embed = baseEmbed(`${food.icon || "🍽️"} ${food.name}`, description, guideUrl);
        embed.fields = [
          { name: "Type", value: limit(food.type), inline: true },
          { name: "Main Ingredient", value: limit(food.main_ingredient), inline: true },
          {
            name: "Recipe",
            value: limit(Array.isArray(food.recipe)
              ? food.recipe.map(item => `${item.amount}× ${item.name}`).join(" + ")
              : "Coming Soon"),
          },
        ];
        return embed;
      }

      case "economy": {
        const economy = await this.get("economy");
        if (! economy) return null;
        const embed = baseEmbed("💰 Starberry Economy", economy.intro, guideUrl);
        embed.fields = [
          { name: "Player Economy", value: limit(economy.currency_description) },
          { name: "Player Shops", value: limit(economy.player_shops?.description) },
          { name: "Bank Baseline", value: limit(`${economy.bank?.input_icon || "💎"} ${economy.bank?.input_amount || 1} ${economy.bank?.input_item || "Diamond"} → ${economy.bank?.output_icon || "💵"} $${economy.bank?.output_amount || 0}`), inline: true },
        ];
        return embed;
      }

      case "bank": {
        const economy = await this.get("economy");
        if (! economy) return null;
        const bank = economy.bank || {};
        const embed = baseEmbed(`🏦 ${bank.name || "The Bank"}`, bank.description || economy.intro, guideUrl);
        embed.fields = [
          { name: "Current Baseline", value: limit(`${bank.input_icon || "💎"} ${bank.input_amount || 1} ${bank.input_item || "Diamond"} → ${bank.output_icon || "💵"} $${bank.output_amount || 0}`), inline: true },
          { name: "Additional Selling", value: limit(bank.additional_selling || "More sellable resources may be added later.") },
        ];
        if (bank.name_note) embed.fields.push({ name: "Note", value: limit(bank.name_note) });
        return embed;
      }

      case "rank": {
        const ranks = await this.get("ranks");
        if (! ranks) return null;
        const rank = ranks.find(item => item.id === command.item || slug(item.name) === slug(command.item));
        if (! rank) return baseEmbed("🍓 Rank not found", `I couldn't find a rank matching **${command.item}**.`, guideUrl);
        const embed = baseEmbed(`${rank.icon || "🍓"} ${rank.name}`, rank.description, guideUrl);
        embed.fields = [
          { name: "Type", value: limit(rank.type), inline: true },
          { name: "Homes", value: String(rank.home_limit ?? "—"), inline: true },
          { name: "QuickShops", value: String(rank.quickshop_limit ?? "—"), inline: true },
          { name: "Perks", value: limit((rank.perks || []).map(perk => `✦ ${perk}`).join("\n")) },
        ];
        return embed;
      }

      default:
        return null;
    }
  }
}

module.exports = { StarberryDataService, SITE_URL };
