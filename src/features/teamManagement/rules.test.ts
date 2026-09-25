import assert from "node:assert/strict";
import test from "node:test";
import { isStrongWorkPassword, normalizeBusinessLoginId, syntheticBusinessEmail, validateTeamInvitation } from "./rules.ts";

test("work identities use a normalized isolated synthetic email", () => {
  assert.equal(normalizeBusinessLoginId(" Kavya Support "), "kavyasupport");
  assert.equal(syntheticBusinessEmail("Kavya.Support"), "kavya.support@work.social24x7.app");
});

test("work password rules reject weak credentials", () => {
  assert.equal(isStrongWorkPassword("Social1234!"), true);
  assert.equal(isStrongWorkPassword("password"), false);
});

test("team invitation validation requires customer identity and role", () => {
  const result = validateTeamInvitation({
    storefrontId: "store",
    fullName: "Kavya",
    workEmail: "kavya@company.test",
    loginId: "kavya.support",
    customerTagline: "from Social24 Test Store",
    jobTitle: "Support Lead",
    employeeId: "",
    department: "Support",
    roleId: "support-role",
  });
  assert.equal(result.valid, true);
  assert.equal(result.loginId, "kavya.support");
});
