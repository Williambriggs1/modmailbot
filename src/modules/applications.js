const moment = require("moment");
const Eris = require("eris");
const { Routes } = require("discord-api-types/v10");
const { getOrFetchChannel } = require("../utils");

const STATUS_ACTIVE = "active";
const STATUS_COMPLETED = "completed";
const STATUS_CANCELLED = "cancelled";

function normalizeQuestions(value) {
  let questions = value || [];
  if (typeof questions === "string") {
    questions = questions.split("||");
  }

  if (! Array.isArray(questions)) return [];

  return questions
    .map(question => typeof question === "string" ? question.trim() : "")
    .filter(Boolean);
}

function normalizeStringArray(value) {
  if (! value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const separator = value.includes("||") ? "||" : ",";
    return value.split(separator).map(item => item.trim()).filter(Boolean);
  }

  return [];
}

function toDisplayName(key) {
  return key
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getApplicationDefinitions(config) {
  const applicationConfig = config.applications || {};
  const definitions = {};
  const sharedStartRoles = normalizeStringArray(applicationConfig.startRoles);
  const rawTypes = applicationConfig.types;

  if (rawTypes && typeof rawTypes === "object" && ! Array.isArray(rawTypes)) {
    for (const [rawKey, rawDefinition] of Object.entries(rawTypes)) {
      if (! rawDefinition || typeof rawDefinition !== "object" || Array.isArray(rawDefinition)) continue;

      const key = rawKey.trim().toLowerCase();
      if (! key) continue;

      definitions[key] = {
        key,
        name: rawDefinition.name || `${toDisplayName(key)} Application`,
        categoryId: rawDefinition.categoryId || applicationConfig.categoryId,
        introMessage: rawDefinition.introMessage || applicationConfig.introMessage,
        completionMessage: rawDefinition.completionMessage || applicationConfig.completionMessage,
        questions: normalizeQuestions(rawDefinition.questions || applicationConfig.questions),
        startRoles: normalizeStringArray(rawDefinition.startRoles).length
          ? normalizeStringArray(rawDefinition.startRoles)
          : sharedStartRoles,
      };
    }
  }

  // Backwards compatibility with the original single-application configuration.
  if (Object.keys(definitions).length === 0) {
    const legacyKey = String(applicationConfig.defaultType || "staff").trim().toLowerCase() || "staff";
    definitions[legacyKey] = {
      key: legacyKey,
      name: applicationConfig.name || `${toDisplayName(legacyKey)} Application`,
      categoryId: applicationConfig.categoryId,
      introMessage: applicationConfig.introMessage,
      completionMessage: applicationConfig.completionMessage,
      questions: normalizeQuestions(applicationConfig.questions),
      startRoles: sharedStartRoles,
    };
  }

  return definitions;
}

function parseJson(value, fallback) {
  if (! value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

module.exports = ({ bot, knex, config, commands, hooks }) => {
  if (! config.applications || config.applications.enabled === false) return;

  const definitions = getApplicationDefinitions(config);
  const typeKeys = Object.keys(definitions);
  const configuredDefaultType = String(config.applications.defaultType || "").trim().toLowerCase();
  const defaultType = definitions[configuredDefaultType]
    ? configuredDefaultType
    : (definitions.staff ? "staff" : (typeKeys.length === 1 ? typeKeys[0] : null));

  function getDefinition(type) {
    if (! type) return null;
    return definitions[String(type).trim().toLowerCase()] || null;
  }

  function getDefinitionForApplication(application) {
    return getDefinition(application.application_type || defaultType || "staff");
  }

  function getQuestionsForApplication(application, definition) {
    const snapshot = parseJson(application.questions_snapshot, null);
    if (Array.isArray(snapshot) && snapshot.length) return snapshot;
    return definition ? definition.questions : [];
  }

  function getApplicationName(application, definition) {
    return application.application_name || (definition && definition.name) || `${toDisplayName(application.application_type || "application")} Application`;
  }

  function listTypes() {
    return typeKeys
      .map(key => `- \`${key}\` — ${definitions[key].name}`)
      .join("\n");
  }

  function canStartType(member, definition) {
    if (! definition.startRoles.length) return true;
    if (! member || ! Array.isArray(member.roles)) return false;
    return definition.startRoles.some(roleId => member.roles.includes(roleId));
  }

  async function findLatestApplication(threadId) {
    return knex("applications")
      .where("thread_id", threadId)
      .orderBy("id", "desc")
      .first();
  }

  async function findActiveApplication(threadId) {
    return knex("applications")
      .where("thread_id", threadId)
      .where("status", STATUS_ACTIVE)
      .orderBy("id", "desc")
      .first();
  }

  async function syncPermissionsFromCategory(thread, category) {
    const newPerms = Array.from(category.permissionOverwrites.map(ow => ({
      id: ow.id,
      type: ow.type,
      allow: ow.allow,
      deny: ow.deny,
    })));

    await bot.requestHandler.request("PATCH", Routes.channel(thread.channel_id), true, {
      permission_overwrites: newPerms,
    });
  }

  async function restoreChannel(thread, application) {
    const originalPermissions = parseJson(application.original_permissions, []);

    await bot.editChannel(thread.channel_id, {
      parentID: application.original_parent_id || null,
    });

    await bot.requestHandler.request("PATCH", Routes.channel(thread.channel_id), true, {
      permission_overwrites: originalPermissions,
    });

    await knex("applications")
      .where("id", application.id)
      .update({ unlocked_at: moment.utc().format("YYYY-MM-DD HH:mm:ss") });
  }

  async function sendQuestion(thread, applicationName, questions, index) {
    const question = questions[index];
    if (! question) return;

    const prefix = `🍓 **${applicationName} — Question ${index + 1}/${questions.length}**`;
    await thread.sendSystemMessageToUser(`${prefix}\n\n${question}`);
  }

  async function finishApplication(thread, application, definition, questions) {
    const completedAt = moment.utc().format("YYYY-MM-DD HH:mm:ss");
    const applicationName = getApplicationName(application, definition);

    await knex("applications")
      .where("id", application.id)
      .update({
        status: STATUS_COMPLETED,
        completed_at: completedAt,
        current_question: questions.length,
      });

    const completionMessage = (definition && definition.completionMessage)
      || `🍓 **${applicationName} complete!** Thank you for answering every question. Your application is now waiting for staff review.`;

    await thread.sendSystemMessageToUser(completionMessage);
    await thread.postSystemMessage(`🔒 **${applicationName} completed.** This ticket will remain restricted until staff use \`${config.prefix}apply unlock\`.`);
  }

  commands.addInboxThreadCommand("apply types", [], async (msg, args, thread) => {
    if (! typeKeys.length) {
      await thread.postSystemMessage("No application types are configured.");
      return;
    }

    await thread.postSystemMessage(`**Configured application types:**\n${listTypes()}`);
  });

  commands.addInboxThreadCommand("apply start", "[type:string]", async (msg, args, thread) => {
    const requestedType = args.type ? String(args.type).trim().toLowerCase() : defaultType;
    const definition = getDefinition(requestedType);

    if (! definition) {
      const usage = typeKeys.length > 1
        ? `Choose an application type with \`${config.prefix}apply start <type>\`.`
        : `No valid application type is configured.`;
      await thread.postSystemMessage(`${usage}\n\n**Available types:**\n${listTypes()}`);
      return;
    }

    if (! canStartType(msg.member, definition)) {
      await thread.postSystemMessage(`You do not have one of the roles allowed to start the **${definition.name}**.`);
      return;
    }

    if (! definition.categoryId) {
      await thread.postSystemMessage(`The **${definition.name}** is missing a configured category ID.`);
      return;
    }

    if (definition.questions.length === 0) {
      await thread.postSystemMessage(`The **${definition.name}** has no questions configured.`);
      return;
    }

    const active = await findActiveApplication(thread.id);
    if (active) {
      const activeDefinition = getDefinitionForApplication(active);
      const activeQuestions = getQuestionsForApplication(active, activeDefinition);
      await thread.postSystemMessage(`An application is already active on this ticket (question ${active.current_question + 1}/${activeQuestions.length}).`);
      return;
    }

    const previousApplication = await findLatestApplication(thread.id);
    if (previousApplication && ! previousApplication.unlocked_at) {
      await thread.postSystemMessage(`The previous application ticket is still restricted. Use \`${config.prefix}apply unlock\` before starting another application.`);
      return;
    }

    const channel = await getOrFetchChannel(bot, thread.channel_id);
    const category = bot.getChannel(definition.categoryId);
    if (! category || ! (category instanceof Eris.CategoryChannel)) {
      await thread.postSystemMessage(`The category configured for **${definition.name}** could not be found or is not a category.`);
      return;
    }

    const originalPermissions = Array.from(channel.permissionOverwrites.map(ow => ({
      id: ow.id,
      type: ow.type,
      allow: ow.allow,
      deny: ow.deny,
    })));

    const insertedIds = await knex("applications").insert({
      thread_id: thread.id,
      user_id: thread.user_id,
      application_type: definition.key,
      application_name: definition.name,
      questions_snapshot: JSON.stringify(definition.questions),
      status: STATUS_ACTIVE,
      current_question: 0,
      answers: JSON.stringify([]),
      started_by: msg.author.id,
      original_parent_id: channel.parentID || null,
      original_permissions: JSON.stringify(originalPermissions),
      started_at: moment.utc().format("YYYY-MM-DD HH:mm:ss"),
    });

    try {
      await bot.editChannel(thread.channel_id, { parentID: category.id });
      await syncPermissionsFromCategory(thread, category);
    } catch (err) {
      await knex("applications").where("id", insertedIds[0]).delete();
      await thread.postSystemMessage(`Failed to lock the application ticket: ${err.message}`);
      return;
    }

    const intro = definition.introMessage
      || `🍓 **${definition.name}**\n\nStaff have started an application with you. I’ll ask the questions one at a time here in DMs. Please answer each question in a single text message.`;

    await thread.sendSystemMessageToUser(intro);
    await thread.postSystemMessage(`🔒 **${definition.name} started by <@${msg.author.id}>.** Ticket moved to its application category and synced to that category's role permissions.`, {
      allowedMentions: { users: [msg.author.id] },
    });
    await sendQuestion(thread, definition.name, definition.questions, 0);
  });

  commands.addInboxThreadCommand("apply stop", [], async (msg, args, thread) => {
    const active = await findActiveApplication(thread.id);
    if (! active) {
      await thread.postSystemMessage("There is no active application on this ticket.");
      return;
    }

    const definition = getDefinitionForApplication(active);
    const applicationName = getApplicationName(active, definition);

    await knex("applications")
      .where("id", active.id)
      .update({ status: STATUS_CANCELLED });

    try {
      await restoreChannel(thread, active);
    } catch (err) {
      await thread.postSystemMessage(`Application stopped, but the original ticket permissions could not be restored: ${err.message}`);
      return;
    }

    await thread.sendSystemMessageToUser(`Your ${applicationName} session has been stopped. You can continue using this conversation as normal Modmail.`);
    await thread.postSystemMessage(`${applicationName} stopped by <@${msg.author.id}> and the ticket's original category/permissions were restored.`, {
      allowedMentions: { users: [msg.author.id] },
    });
  });

  commands.addInboxThreadCommand("apply unlock", [], async (msg, args, thread) => {
    const application = await findLatestApplication(thread.id);
    if (! application) {
      await thread.postSystemMessage("This ticket has no application record to unlock.");
      return;
    }

    const definition = getDefinitionForApplication(application);
    const applicationName = getApplicationName(application, definition);

    if (application.status === STATUS_ACTIVE) {
      await thread.postSystemMessage(`The ${applicationName} is still active. Use \`${config.prefix}apply stop\` if you want to cancel it and restore the normal ticket permissions.`);
      return;
    }

    if (application.unlocked_at) {
      await thread.postSystemMessage("This application ticket has already been unlocked.");
      return;
    }

    try {
      await restoreChannel(thread, application);
      await thread.postSystemMessage(`🔓 ${applicationName} ticket unlocked by <@${msg.author.id}>. Original category/permissions restored.`, {
        allowedMentions: { users: [msg.author.id] },
      });
    } catch (err) {
      await thread.postSystemMessage(`Failed to restore the original ticket permissions: ${err.message}`);
    }
  });

  commands.addInboxThreadCommand("apply status", [], async (msg, args, thread) => {
    const application = await findLatestApplication(thread.id);
    if (! application) {
      await thread.postSystemMessage("No application has been started in this ticket.");
      return;
    }

    const definition = getDefinitionForApplication(application);
    const questions = getQuestionsForApplication(application, definition);
    const applicationName = getApplicationName(application, definition);
    const answers = parseJson(application.answers, []);
    const progress = Math.min(application.current_question, questions.length);
    const locked = application.unlocked_at ? "No" : "Yes";

    await thread.postSystemMessage(
      `**Application:** ${applicationName} (\`${application.application_type || "staff"}\`)\n` +
      `**Status:** ${application.status}\n` +
      `**Progress:** ${progress}/${questions.length}\n` +
      `**Answers saved:** ${answers.length}\n` +
      `**Ticket locked:** ${locked}`
    );
  });

  hooks.beforeNewMessageReceived(async ({ message, opts, cancel }) => {
    if (! opts || ! opts.thread || ! message) return;

    const thread = opts.thread;
    const application = await findActiveApplication(thread.id);
    if (! application) return;

    // Consume the user's DM so normal Modmail does not relay it as a regular ticket message.
    cancel();

    const definition = getDefinitionForApplication(application);
    const questions = getQuestionsForApplication(application, definition);
    const applicationName = getApplicationName(application, definition);

    if (! questions.length) {
      await thread.sendSystemMessageToUser("Your application is currently paused because its question configuration is unavailable. Please wait for staff to assist you.");
      await thread.postSystemMessage(`⚠️ The active **${applicationName}** has no available question snapshot/configuration.`);
      return;
    }

    const answer = (message.content || "").trim();
    if (! answer) {
      await thread.sendSystemMessageToUser("Please answer this application question with a text message.");
      return;
    }

    const currentIndex = application.current_question;
    if (currentIndex >= questions.length) {
      await finishApplication(thread, application, definition, questions);
      return;
    }

    const answers = parseJson(application.answers, []);
    answers.push({
      question: questions[currentIndex],
      answer,
      answered_at: moment.utc().format("YYYY-MM-DD HH:mm:ss"),
      dm_message_id: message.id,
    });

    const nextIndex = currentIndex + 1;
    await knex("applications")
      .where("id", application.id)
      .update({
        answers: JSON.stringify(answers),
        current_question: nextIndex,
      });

    await thread.postSystemMessage(
      `🍓 **${applicationName} — Answer ${currentIndex + 1}/${questions.length}**\n` +
      `**Q:** ${questions[currentIndex]}\n` +
      `**A:** ${answer}`
    );

    if (nextIndex >= questions.length) {
      await finishApplication(thread, { ...application, current_question: nextIndex }, definition, questions);
    } else {
      await sendQuestion(thread, applicationName, questions, nextIndex);
    }
  });

  hooks.afterThreadClose(async ({ threadId }) => {
    await knex("applications")
      .where("thread_id", threadId)
      .where("status", STATUS_ACTIVE)
      .update({ status: STATUS_CANCELLED });
  });
};
