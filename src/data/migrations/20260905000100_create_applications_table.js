exports.up = async function(knex) {
  if (! await knex.schema.hasTable("applications")) {
    await knex.schema.createTable("applications", table => {
      table.increments("id").primary();
      table.string("thread_id", 64).notNullable().index();
      table.string("user_id", 32).notNullable().index();
      table.string("status", 24).notNullable().defaultTo("active").index();
      table.integer("current_question").notNullable().defaultTo(0);
      table.text("answers").nullable();
      table.string("started_by", 32).nullable();
      table.string("original_parent_id", 32).nullable();
      table.text("original_permissions").nullable();
      table.dateTime("started_at").notNullable();
      table.dateTime("completed_at").nullable();
      table.dateTime("unlocked_at").nullable();
    });
  }
};

exports.down = async function(knex) {
  if (await knex.schema.hasTable("applications")) {
    await knex.schema.dropTable("applications");
  }
};
