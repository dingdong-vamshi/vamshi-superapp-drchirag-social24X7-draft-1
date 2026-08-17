import assert from "node:assert/strict";
import test from "node:test";

import { profileIdFromQrPayload } from "./profileQrUtils.ts";

const id = "272d8b05-da97-4d4c-8294-be45b7958ec9";

test("accepts Social 24x7 custom links and raw profile IDs", () => {
  assert.equal(profileIdFromQrPayload(`social24x7://profile/${id}`), id);
  assert.equal(profileIdFromQrPayload(id), id);
});

test("accepts trusted production profile links", () => {
  assert.equal(profileIdFromQrPayload(`https://social24x7.app/profile/${id}`), id);
  assert.equal(
    profileIdFromQrPayload(`https://vamshi-superapp-drchirag-social24x7.vercel.app/profile/${id}`),
    id,
  );
});

test("rejects untrusted or malformed links", () => {
  assert.equal(profileIdFromQrPayload(`https://example.com/profile/${id}`), null);
  assert.equal(profileIdFromQrPayload(`http://social24x7.app/profile/${id}`), null);
  assert.equal(profileIdFromQrPayload(`javascript:alert(1)`), null);
  assert.equal(profileIdFromQrPayload(`https://social24x7.app.evil.example/profile/${id}`), null);
  assert.equal(profileIdFromQrPayload("social24x7://profile/not-a-uuid"), null);
});
