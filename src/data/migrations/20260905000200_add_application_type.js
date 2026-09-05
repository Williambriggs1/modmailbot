exports.up = async function(knex) {
  if (! await knex.schema.hasColumn("applications", "application_type")) {
    await knex.schema.table("applications", table => {
      table.string("application_type", 64).nullable().index();
    });
  }

  if (! await knex.schema.hasColumn("applications", "application_name")) {
    await knex.schema.table("applications", table => {
      table.string("application_name", 128).nullable();
    });
  }

  if (! await knex.schema.hasColumn("applications", "questions_snapshot")) {
    await knex.schema.table("applications", table => {
      table.text("questions_snapshot").nullable();
    });
  }

  await knex("applications")
    .whereNull("application_type")
    .update({ application_type: "staff" });

  await knex("applications")
    .whereNull("application_name")
    .update({ application_name: "Staff Application" });
};

exports.down = async function(knex) {
  if (await knex.schema.hasColumn("applications", "questions_snapshot")) {
    await knex.schema.table("applications", table => {
      table.dropColumn("questions_snapshot");
    });
  }

  if (await knex.schema.hasColumn("applications", "application_name")) {
    await knex.schema.table("applications", table => {
      table.dropColumn("application_name");
    });
  }

  if (await knex.schema.hasColumn("applications", "application_type")) {
    await knex.schema.table("applications", table => {
      table.dropColumn("application_type");
    });
  }
};
