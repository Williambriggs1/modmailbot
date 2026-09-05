# Application tickets

This fork includes an optional staff-application workflow that runs inside an existing Modmail ticket.

## How it works

1. A user opens a normal Modmail ticket.
2. Staff run `!apply start` inside that ticket.
3. The bot saves the ticket's original category and permission overwrites.
4. The ticket is moved to the configured application category and its permissions are synced from that category.
5. The bot asks the configured questions one at a time in the user's existing Modmail DM.
6. Each user answer is consumed by the application workflow instead of being relayed as a normal Modmail message, then shown in the staff ticket as an application answer.
7. When all questions are answered, the application is marked complete and the ticket remains restricted for staff review.
8. Staff run `!apply unlock` to restore the ticket's original category and permissions.

The role level that can see application tickets is controlled by the Discord permission overwrites on the application category. For example, if only Forest Warden, Elder Guardian, Forest Manager, and Forestkeeper can view that category, lower staff roles will lose access as soon as `!apply start` is used.

## Commands

- `!apply start` — start the questionnaire and lock the current Modmail ticket to the application category.
- `!apply status` — show application status, progress, saved answer count, and whether the ticket is still locked.
- `!apply stop` — cancel an active application and restore the ticket's original category/permissions.
- `!apply unlock` — restore the original category/permissions after a completed or cancelled application.

## Configuration

Applications are disabled unless the `applications` configuration is present.

### config.json5 example

```json5
{
  // ...normal Modmail settings...

  applications: {
    enabled: true,

    // Create a private Discord category for applications and put its ID here.
    // Configure the category so ONLY the staff level that should review
    // applications has View Channel access.
    categoryId: "REPLACE_WITH_APPLICATION_CATEGORY_ID",

    introMessage: [
      "🍓 **Starberry Staff Application**",
      "",
      "Staff have started an application with you. I'll ask the questions one at a time here in DMs."
    ].join("\n"),

    completionMessage: "🍓 **Application complete!** Your answers have been submitted for staff review.",

    questions: [
      "What is your Minecraft username?",
      "How old are you?",
      "What timezone are you in?",
      "How long have you been part of Starberry?",
      "Why would you like to join the Starberry staff team?",
      "Do you have previous moderation or community staff experience?",
      "How would you handle a disagreement between two players?",
      "Is there anything else you would like us to know?"
    ]
  }
}
```

### config.ini example

For INI configs, separate questions with `||`:

```ini
applications.enabled = true
applications.categoryId = REPLACE_WITH_APPLICATION_CATEGORY_ID
applications.introMessage = 🍓 Starberry Staff Application - Staff have started an application with you. Answer each question in one message.
applications.completionMessage = 🍓 Application complete! Your answers have been submitted for staff review.
applications.questions = What is your Minecraft username?||How old are you?||What timezone are you in?||Why would you like to join the Starberry staff team?||Do you have previous moderation experience?||How would you handle a disagreement between two players?||Is there anything else you would like us to know?
```

## Database

A migration creates an `applications` table automatically the next time Modmail starts. Application progress, answers, original ticket permissions, timestamps, and status are stored there so an in-progress questionnaire survives a bot restart.

## Important Discord setup

The application category is the access-control source. Configure its role permissions before enabling this feature. When `!apply start` runs, the ticket's permission overwrites are replaced with the category's overwrites. When staff later run `!apply unlock` or cancel with `!apply stop`, the original ticket category and permission overwrites are restored.
