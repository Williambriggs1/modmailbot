# Application tickets

This fork includes an optional modular application workflow that runs inside an existing Modmail ticket.

## How it works

1. A user opens a normal Modmail ticket.
2. Staff run `!apply start <type>` inside that ticket, for example `!apply start builder`.
3. The bot saves the ticket's original category and permission overwrites.
4. The ticket is locked for application review. If `reviewRoles` is configured, the ticket can stay in the same category while only the configured reviewer roles can view the individual channel. If `reviewRoles` is omitted, the older category-permission behavior is used instead.
5. The bot asks that application's questions one at a time in the user's existing Modmail DM.
6. Each user answer is consumed by the application workflow instead of being relayed as a normal Modmail message, then shown in the staff ticket as an application answer.
7. When all questions are answered, the application is marked complete and the ticket remains restricted for staff review.
8. Staff run `!apply unlock` to restore the ticket's exact original category and permission overwrites.

Each application type can have its own name, questions, category, intro/completion messages, roles allowed to start it, and roles allowed to review it.

## Commands

- `!apply types` — list all configured application types.
- `!apply start <type>` — start a specific application and lock the current Modmail ticket.
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

## `startRoles` vs `reviewRoles`

These settings do different jobs:

- `startRoles` controls which staff roles are allowed to run `!apply start <type>`.
- `reviewRoles` controls which roles can see the ticket after the application starts.

When `reviewRoles` is present, the bot replaces the ticket's channel overwrites with a private application lock:

- `@everyone` is denied **View Channel**.
- Every role in `reviewRoles` is allowed **View Channel**.
- The bot itself is explicitly allowed **View Channel**.
- Discord members with the **Administrator** permission can still see the channel, because Administrator bypasses channel permission overwrites.

The original permission overwrites are saved before the lock and restored by `!apply stop` or `!apply unlock`.

This makes it safe to keep normal tickets and all application types in one Discord category.

## Modular configuration

Applications are disabled unless the `applications` configuration is present.

### config.json5 example

```json5
{
  // ...normal Modmail settings...

  applications: {
    enabled: true,
    defaultType: "support",

    types: {
      support: {
        name: "Support Team Application",

        // This can be the SAME category used by normal Modmail tickets.
        categoryId: "TICKET_CATEGORY_ID",

        // Who may start this application.
        startRoles: [
          "SCOUT_ROLE_ID",
          "FOREST_WARDEN_ROLE_ID",
          "MANAGEMENT_ROLE_ID"
        ],

        // Who may view/review the ticket once the application starts.
        reviewRoles: [
          "SCOUT_ROLE_ID",
          "FOREST_WARDEN_ROLE_ID",
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
        categoryId: "TICKET_CATEGORY_ID",
        startRoles: [
          "GARDENER_ROLE_ID",
          "MANAGEMENT_ROLE_ID"
        ],
        reviewRoles: [
          "GARDENER_ROLE_ID",
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

## Same-category example

You can keep all of these channels together:

```text
TICKETS
  # player-one
  # player-two
  # player-three
```

A normal ticket might be visible to all Modmail staff. After:

```text
!apply start builder
```

the same `#player-one` channel remains in `TICKETS`, but its own channel overwrites are replaced so only the Builder review roles can see it.

This avoids needing separate Support Applications, Builder Applications, Media Applications, and Events Applications categories.

## Category fallback behavior

`reviewRoles` is optional for backwards compatibility.

If an application type has no `reviewRoles`, the bot uses the original behavior:

1. Move the ticket to that application's `categoryId` if necessary.
2. Copy the category's permission overwrites onto the ticket.

This allows existing configurations to keep working unchanged.

If `reviewRoles` is configured, the review-role lock takes priority over category permission syncing. `categoryId` can still be used to move the ticket, or it can point to the same category as normal Modmail.

## config.ini example

For INI configs, nested application types use dotted keys. Separate questions and role IDs with `||`.

```ini
applications.enabled = true
applications.defaultType = support

applications.types.support.name = Support Team Application
applications.types.support.categoryId = TICKET_CATEGORY_ID
applications.types.support.startRoles = SCOUT_ROLE_ID||FOREST_WARDEN_ROLE_ID||MANAGEMENT_ROLE_ID
applications.types.support.reviewRoles = SCOUT_ROLE_ID||FOREST_WARDEN_ROLE_ID||MANAGEMENT_ROLE_ID
applications.types.support.introMessage = 🍓 Support Team Application - Please answer each question in one message.
applications.types.support.completionMessage = 🍓 Support application complete! Your answers are ready for review.
applications.types.support.questions = What is your Minecraft username?||What timezone are you in?||Why are you interested in Support?||How would you respond to an upset player?||How active are you usually?||Is there anything else you would like us to know?

applications.types.builder.name = Builder Application
applications.types.builder.categoryId = TICKET_CATEGORY_ID
applications.types.builder.startRoles = GARDENER_ROLE_ID||MANAGEMENT_ROLE_ID
applications.types.builder.reviewRoles = GARDENER_ROLE_ID||MANAGEMENT_ROLE_ID
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
  categoryId: "TICKET_CATEGORY_ID",
  startRoles: ["MANAGEMENT_ROLE_ID"],
  reviewRoles: ["MANAGEMENT_ROLE_ID"],
  completionMessage: "Your application is complete and waiting for review.",

  types: {
    support: {
      name: "Support Application",
      questions: ["..."]
    },
    builder: {
      name: "Builder Application",
      reviewRoles: ["GARDENER_ROLE_ID", "MANAGEMENT_ROLE_ID"],
      questions: ["..."]
    }
  }
}
```

The Support application inherits the shared values. Builder overrides only `reviewRoles` while still inheriting the other shared settings.

## Backwards compatibility

The original single-application format still works:

```ini
applications.enabled = true
applications.categoryId = APPLICATION_CATEGORY_ID
applications.questions = Question one||Question two||Question three
```

It is treated as a `staff` application internally. You can also add shared `applications.reviewRoles` to the legacy format if you want role-based channel locking without converting to `applications.types.*` yet.

## Database

Application progress is stored in the database so an in-progress questionnaire survives a bot restart. Modular applications save:

- the application type (`support`, `builder`, etc.)
- the display name at the time it started
- a snapshot of the question list
- answers and progress
- original ticket permissions/category
- timestamps and status

Saving the question snapshot means editing a team's configured questions does not alter applications that are already in progress.

No additional database migration is required for `reviewRoles`, because review-role locking is applied to Discord channel permissions at application start while the existing original-permission snapshot handles restoration.
