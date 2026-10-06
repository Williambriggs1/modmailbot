const APPLICATION_PRESETS = {
  moderation: {
    name: "Moderation Staff Application",
    aliases: ["moderation", "moderator", "moderation-staff", "staff", "scout"],
    questions: [
      "What is your Discord username?",
      "What is your Minecraft username?",
      "How old are you?",
      "What timezone are you in?",
      "What are your pronouns?",
      "How active are you usually?",
      "How long have you been part of StarBerry SMP?",
      "Have you been staff on another server before? If yes, tell us about your experience.",
      "Why would you like to join the Staff Team?",
      "What do you think makes someone a good staff member?",
      "What strengths would you bring to the team?",
      "What do you think is the most important responsibility of a staff member?",
      "How would you handle a disagreement between two members?",
      "What would you do if a friend broke one of the server rules?",
      "**Scenario:** Two players are arguing in chat and the situation is getting worse. What would you do?",
      "**Scenario:** You notice another staff member breaking a rule. How would you handle it?",
      "Is there anything you would like to improve or contribute to StarBerry SMP?",
    ],
  },

  builder: {
    name: "Builder Application",
    aliases: ["builder", "gardener", "build"],
    questions: [
      "What is your Discord username?",
      "What is your Minecraft username?",
      "How old are you?",
      "What timezone are you in?",
      "What are your pronouns?",
      "How active are you usually?",
      "How long have you been part of StarBerry SMP?",
      "Have you been staff on another server before? If yes, tell us about your experience.",
      "Do you have experience with WorldEdit or other building tools?",
      "What type of builds do you enjoy making the most?",
      "How comfortable are you following someone else's design or theme?",
      "How comfortable are you taking constructive criticism?",
      "How would you approach building something you haven't built before?",
      "How do you work when building as part of a team?",
      "What do you think makes a Minecraft build feel cozy and welcoming?",
      "**Scenario:** You and another builder have very different ideas for a project. How would you handle it?",
      "**Scenario:** You finish a build and the project leader asks you to change a large part of it. How would you respond?",
    ],
  },

  events: {
    name: "Events Application",
    aliases: ["events", "event", "stargazer"],
    questions: [
      "What is your Discord username?",
      "What is your Minecraft username?",
      "How old are you?",
      "What timezone are you in?",
      "What are your pronouns?",
      "How active are you usually?",
      "How long have you been part of StarBerry SMP?",
      "Why would you like to join the Event Team?",
      "What makes an event fun and enjoyable?",
      "What kinds of Minecraft events would you like to host?",
      "How would you handle a disagreement about an event idea?",
      "**Scenario:** An event is supposed to start in 10 minutes, but something goes wrong. What would you do?",
      "**Scenario:** Players start exploiting a loophole in your event rules. How would you handle it?",
      "Do you have experience hosting events? If yes, tell us about them.",
      "What is one event you think StarBerry SMP needs? 🍓",
    ],
  },

  media: {
    name: "Media Staff Application",
    aliases: ["media", "media-staff", "firefly"],
    questions: [
      "What is your Discord username?",
      "What is your Minecraft username?",
      "How old are you?",
      "What timezone are you in?",
      "What are your pronouns?",
      "How active are you usually?",
      "How long have you been part of StarBerry SMP?",
      "Have you been staff on another server before? If yes, tell us about your experience.",
      "Do you have experience with: Video editing, Screenshots/photography, Graphic design, Writing, Short-form content, Social media, or Voice/content creation?",
      "Do you have a portfolio or examples of your work?",
      "How would you make StarBerry SMP stand out on social media?",
      "What kind of content do you think works well for a Minecraft SMP?",
      "How comfortable are you working with deadlines?",
      "How would you handle running out of ideas?",
      "How would you make sure content represents StarBerry SMP's cozy/foresty aesthetic?",
      "**Scenario:** You have been asked to make a promotional post for an upcoming event. What information would you include?",
      "**Scenario:** A post you created doesn't perform well. What would you do differently next time?",
    ],
  },

  creative: {
    name: "Creative Staff Application",
    aliases: ["creative", "creative-staff"],
    questions: [
      "What is your Discord username?",
      "What is your Minecraft username?",
      "How old are you?",
      "What timezone are you in?",
      "What are your pronouns?",
      "How active are you usually?",
      "How long have you been part of StarBerry SMP?",
      "Have you been staff on another server before? If yes, tell us about your experience.",
      "Why would you like to join the Creative Team?",
      "What kinds of creative things do you enjoy making?",
      "What do you think makes small details on a Minecraft server memorable?",
      "What would you like to contribute to StarBerry SMP?",
      "What are some things you think the Creative Team could create for the server?",
      "**Scenario:** The server needs a new set of tags for an upcoming event. What kind of tags would you create?",
      "**Scenario:** You're asked to create a small Valentine's-themed collectible. What would you make?",
      "**Scenario:** Players have discovered everything currently available in an area. What small things could you add to give them something new to discover?",
    ],
  },
};

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function getStarberryApplicationPreset(key, displayName) {
  const candidates = [normalize(key), normalize(displayName)];

  for (const preset of Object.values(APPLICATION_PRESETS)) {
    const aliases = preset.aliases.map(normalize);
    if (candidates.some(candidate => aliases.includes(candidate))) return preset;

    const display = normalize(displayName);
    if (display && aliases.some(alias => display.includes(alias))) return preset;
  }

  return null;
}

module.exports = {
  APPLICATION_PRESETS,
  getStarberryApplicationPreset,
};
