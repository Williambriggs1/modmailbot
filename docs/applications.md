# Application tickets

This fork includes an optional modular application workflow that runs inside an existing Modmail ticket.

## How it works

1. A user opens a normal Modmail ticket.
2. Staff run `!apply start <type>` inside that ticket, for example `!apply start builder`.
3. The bot saves the ticket's original category and permission overwrites.
4. The ticket is moved to that application type's configured category and its permissions are synced from the category.
5. The bot asks that application's questions one at a time in the user's existing Modmail DM.
6. Each user answer is consumed by the application workflow instead of being relayed as a normal Modmail message, then shown in the staff ticket as an application answer.
7. When all questions are answered, the application is marked complete and the ticket remains restricted for staff review.
8. Staff run `!apply unlock` to restore the ticket's original category and permissions.

Each application type can have its own name, questions, category, intro/completion messages, and optional roles allowed to start it.

The role level that can **view/review** an application is controlled by the Discord permission overwrites on that application's category. This makes it possible for Builder applications and Support applications to have completely different reviewer access.

## Commands

- `!apply types` — list all configured application types.
- `!apply start <type>` — start a specific application and lock the current Modmail ticket to that application's category.
- `!apply start` — starts the configured `defaultType`; if there is only one type it is used automatically.
- `!apply status` — show the application type, status, progress, saved answer count, and whether the ticket is still locked.
- `!apply stop` — cancel an active application and restore the ticket's original category/permissions.
- `!apply unlock` — restore the original category/permissions after a completed application.

Examples:

```text
!apply types
!apply start support
!apply start builder
!apply status
!apply unlock
```

## Modular configuration

Applications are disabled unless the `applications` configuration is present.

### config.json5 example

```json5
{
  // ...normal Modmail settings...

  applications: {
    enabled: true,

    // Optional. Lets staff use !apply start without specifying a type.
    defaultType: "support",

    types: {
      support: {
        name: "Support Team Application",
        categoryId: "SUPPORT_APPLICATION_CATEGORY_ID",

        // Optional. If present, a staff member must have at least one of
        // these exact role IDs to run !apply start support.
        startRoles: [
          "SUPPORT_LEAD_ROLE_ID",
          "MANAGEMENT_ROLE_ID"
        ],

        introMessage: "🍓 **Support Team Application**\n\nWe'll ask you a few questions one at a time.",
        completionMessage: "🍓 **Support application complete!** Your answers are ready for review.",

        questions: [
          "What is your Minecraft username?",
          "What timezone are you in?",
          "Why are you interested in joining the Support team?",
          "How would you respond to a player who is frustrated or upset?",
          "How active are you usually during the week?",
          "Is there anything else you would like us to know?"
        ]
      },

      builder: {
        name: "Builder Application",
        categoryId: "BUILDER_APPLICATION_CATEGORY_ID",
        startRoles: [
          "LEAD_BUILDER_ROLE_ID",
          "MANAGEMENT_ROLE_ID"
        ],

        introMessage: "🌿 **Starberry Builder Application**\n\nWe'll ask about your building experience and style.",
        completionMessage: "🌿 **Builder application complete!** Your answers are ready for the build team to review.",

        questions: [
          "What is your Minecraft username?",
          "How long have you been building in Minecraft?",
          "What building styles are you most comfortable with?",
          "Do you have a portfolio or screenshots of previous builds? If so, please provide a link.",
          "How comfortable are you working from references or an established server style?",
          "Why would you like to build for Starberry?"
        ]
      }
    }
  }
}
```

### Discord category permissions

The category for each type is the source of truth for who can review that team.

Example:

```text
SUPPORT APPLICATIONS
  Sproutkeeper       ❌ View Channel
  Scout              ✅ View Channel
  Forest Warden      ✅ View Channel
  Management         ✅ View Channel

BUILDER APPLICATIONS
  Regular Staff      ❌ View Channel
  Gardener           ✅ View Channel
  Lead Builder       ✅ View Channel
  Management         ✅ View Channel
```

When `!apply start builder` runs, the Modmail ticket is moved to the Builder Applications category and inherits those permissions. When `!apply start support` runs, it instead uses the Support Applications category.

## config.ini example

For INI configs, nested application types use dotted keys. Separate questions and role IDs with `||`.

```ini
applications.enabled = true
applications.defaultType = support

applications.types.support.name = Support Team Application
applications.types.support.categoryId = SUPPORT_APPLICATION_CATEGORY_ID
applications.types.support.startRoles = SUPPORT_LEAD_ROLE_ID||MANAGEMENT_ROLE_ID
applications.types.support.introMessage = 🍓 Support Team Application - Please answer each question in one message.
applications.types.support.completionMessage = 🍓 Support application complete! Your answers are ready for review.
applications.types.support.questions = What is your Minecraft username?||What timezone are you in?||Why are you interested in Support?||How would you respond to an upset player?||How active are you usually?||Is there anything else you would like us to know?

applications.types.builder.name = Builder Application
applications.types.builder.categoryId = BUILDER_APPLICATION_CATEGORY_ID
applications.types.builder.startRoles = LEAD_BUILDER_ROLE_ID||MANAGEMENT_ROLE_ID
applications.types.builder.introMessage = 🌿 Starberry Builder Application - Please answer each question in one message.
applications.types.builder.completionMessage = 🌿 Builder application complete! Your answers are ready for review.
applications.types.builder.questions = What is your Minecraft username?||How long have you been building?||What styles do you build?||Do you have a portfolio link?||How comfortable are you following references?||Why would you like to build for Starberry?
```

## Shared defaults

Values placed directly under `applications` can act as defaults for every type. A type-specific value overrides the shared value.

For example:

```json5
applications: {
  enabled: true,
  startRoles: ["MANAGEMENT_ROLE_ID"],
  completionMessage: "Your application is complete and waiting for review.",

  types: {
    support: {
      name: "Support Application",
      categoryId: "...",
      questions: ["..."]
    },
    builder: {
      name: "Builder Application",
      categoryId: "...",
      questions: ["..."]
    }
  }
}
```

Both types would inherit the shared `startRoles` and `completionMessage` unless they define their own.

## Backwards compatibility

The original single-application format still works:

```ini
applications.enabled = true
applications.categoryId = APPLICATION_CATEGORY_ID
applications.questions = Question one||Question two||Question three
```

It is treated as a `staff` application internally. You can migrate to `applications.types.*` whenever you are ready.

## Database

Application progress is stored in the database so an in-progress questionnaire survives a bot restart. Modular applications also save:

- the application type (`support`, `builder`, etc.)
- the display name at the time it started
- a snapshot of the question list
- answers and progress
- original ticket permissions/category
- timestamps and status

Saving the question snapshot means editing a team's configured questions does not alter applications that are already in progress.

## Important Discord setup

Configure each application category's role permissions before using that application type. When an application starts, the ticket's permission overwrites are replaced with that category's overwrites. When staff later run `!apply unlock` or cancel with `!apply stop`, the exact original ticket category and permission overwrites are restored.
