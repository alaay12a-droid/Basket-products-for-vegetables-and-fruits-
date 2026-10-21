import assert from "node:assert/strict";
import { test } from "node:test";
import { DrizzleQueryError } from "drizzle-orm";
import { isPostgresUniqueViolation } from "../src/lib/postgres-errors.ts";

test("detects a direct PostgreSQL unique violation", () => {
  assert.equal(isPostgresUniqueViolation({ code: "23505" }), true);
});

test("detects the actual Drizzle wrapper used by user creation and updates", () => {
  for (const query of ["insert into dashboard_users", "update dashboard_users"]) {
    const cause = Object.assign(new Error("unique constraint violation"), {
      code: "23505",
      constraint: "dashboard_users_username_key",
    });
    const error = new DrizzleQueryError(query, [], cause);
    assert.equal(isPostgresUniqueViolation(error), true);
  }
});

test("detects unique violations inside multiple cause wrappers", () => {
  assert.equal(isPostgresUniqueViolation({ cause: { cause: { code: "23505" } } }), true);
});

test("does not classify unrelated failures as duplicate names", () => {
  for (const error of [null, undefined, "23505", { code: 23505 }, new Error("failure"), { cause: { code: "23503" } }]) {
    assert.equal(isPostgresUniqueViolation(error), false);
  }
});

test("terminates safely on a circular error cause", () => {
  const error: { cause?: unknown } = {};
  error.cause = error;
  assert.equal(isPostgresUniqueViolation(error), false);
});
