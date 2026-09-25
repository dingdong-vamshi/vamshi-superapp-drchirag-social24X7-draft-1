import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { syntheticBusinessEmail } from "../teamManagement/rules.ts";

test("business work identities are classified only from trusted app metadata", () => {
  const source = readFileSync(new URL("./businessAuth.ts", import.meta.url), "utf8");
  assert.match(source, /user\?\.app_metadata\?\.account_type === "business_employee"/);
  assert.doesNotMatch(source, /user_metadata\?\.account_type/);
});

test("business login does not reuse employee personal email", () => {
  assert.equal(syntheticBusinessEmail(" Kavya.Support "), "kavya.support@work.social24x7.app");
});
