const moment = require("moment");
const Eris = require("eris");
const { Routes } = require("discord-api-types/v10");
const { getOrFetchChannel } = require("../utils");

const STATUS_ACTIVE = "active";
const STATUS_COMPLETED = "completed";
const STATUS_CANCELLED = "cancelled";

function getQuestions(config) {
  const questions = config.applications && Array.isArray(config.applications.questions)
    ? config.applications.questions
    : [];

  return questions
    .map(question => typeof question === "string" ? question.trim() : "")
    .filter(Boolean);
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

module.exports = ({ bot, knex, config, commands, hooks, threads }) => {
  if (! config.applications || config.applications.enabled === false) return;

  const questions = getQuestions(config);
  const applicationCategoryId = config.applications.categoryId;

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

  async function sendQuestion(thread, index) {
    const question = questions[index];
    if (! question) return;

    const prefix = `🍓 **Staff Application — Question ${index + 1}/${questions.length}**`;
    await thread.sendSystemMessageToUser(`${prefix}\n\n${question}`);
  }

  async function finishApplication(thread, application) {
    const completedAt = moment.utc().format("YYYY-MM-DD HH:mm:ss");
    await knex("applications")
      .where("id", application.id)
      .update({
        status: STATUS_COMPLETED,
        completed_at: completedAt,
        current_question: questions.length,
      });

    const completionMessage = config.applications.completionMessage
      || "🍓 **Application complete!** Thank you for answering every question. Your application is now waiting for staff review.";

    await thread.sendSystemMessageToUser(completionMessage);
    await thread.postSystemMessage("🔒 **Application completed.** This ticket will remain restricted until staff use `!apply unlock`.");
  }

  commands.addInboxThreadCommand("apply start", [], async (msg, args, thread) => {
    if (! applicationCategoryId) {
      await thread.postSystemMessage("Applications are enabled, but `applications.categoryId` has not been configured.");
      return;
    }

    if (questions.length === 0) {
      await thread.postSystemMessage("Applications are enabled, but no `applications.questions` have been configured.");
      return;
    }

    const active = await findActiveApplication(thread.id);
    if (active) {
      await thread.postSystemMessage(`An application is already active on this ticket (question ${active.current_question + 1}/${questions.length}).`);
      return;
    }

    const channel = await getOrFetchChannel(bot, thread.channel_id);
    const category = bot.getChannel(applicationCategoryId);
    if (! category || ! (category instanceof Eris.CategoryChannel)) {
      await thread.postSystemMessage("The configured application category could not be found or is not a category.");
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

    const intro = config.applications.introMessage
      || "🍓 **Starberry Staff Application**\n\nStaff have started an application with you. I’ll ask the questions one at a time here in DMs. Please answer each question in a single text message.";

    await thread.sendSystemMessageToUser(intro);
    await thread.postSystemMessage(`🔒 **Application started by <@${msg.author.id}>.** Ticket moved to <#${category.id}> and synced to that category's role permissions.`, {
      allowedMentions: { users: [msg.author.id] },
    });
    await sendQuestion(thread, 0);
  });

  commands.addInboxThreadCommand("apply stop", [], async (msg, args, thread) => {
    const active = await findActiveApplication(thread.id);
    if (! active) {
      await thread.postSystemMessage("There is no active application on this ticket.");
      return;
    }

    await knex("applications")
      .where("id", active.id)
      .update({ status: STATUS_CANCELLED });

    try {
      await restoreChannel(thread, active);
    } catch (err) {
      await thread.postSystemMessage(`Application stopped, but the original ticket permissions could not be restored: ${err.message}`);
      return;
    }

    await thread.sendSystemMessageToUser("Your staff application session has been stopped. You can continue using this conversation as normal Modmail.");
    await thread.postSystemMessage(`Application stopped by <@${msg.author.id}> and the ticket's original category/permissions were restored.`, {
      allowedMentions: { users: [msg.author.id] },
    });
  });

  commands.addInboxThreadCommand("apply unlock", [], async (msg, args, thread) => {
    const application = await findLatestApplication(thread.id);
    if (! application) {
      await thread.postSystemMessage("This ticket has no application record to unlock.");
      return;
    }

    if (application.status === STATUS_ACTIVE) {
      await thread.postSystemMessage("The application is still active. Use `!apply stop` if you want to cancel it and restore the normal ticket permissions.");
      return;
    }

    if (application.unlocked_at) {
      await thread.postSystemMessage("This application ticket has already been unlocked.");
      return;
    }

    try {
      await restoreChannel(thread, application);
      await thread.postSystemMessage(`🔓 Application ticket unlocked by <@${msg.author.id}>. Original category/permissions restored.`, {
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

    const answers = parseJson(application.answers, []);
    const progress = Math.min(application.current_question, questions.length);
    const locked = application.unlocked_at ? "No" : "Yes";
    await thread.postSystemMessage(
      `**Application status:** ${application.status}\n` +
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

    const answer = (message.content || "").trim();
    if (! answer) {
      await thread.sendSystemMessageToUser("Please answer this application question with a text message.");
      return;
    }

    const currentIndex = application.current_question;
    if (currentIndex >= questions.length) {
      await finishApplication(thread, application);
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
      `🍓 **Application Answer ${currentIndex + 1}/${questions.length}**\n` +
      `**Q:** ${questions[currentIndex]}\n` +
      `**A:** ${answer}`
    );

    if (nextIndex >= questions.length) {
      await finishApplication(thread, { ...application, current_question: nextIndex });
    } else {
      await sendQuestion(thread, nextIndex);
    }
  });

  hooks.afterThreadClose(async ({ threadId }) => {
    await knex("applications")
      .where("thread_id", threadId)
      .where("status", STATUS_ACTIVE)
      .update({ status: STATUS_CANCELLED });
  });
};
