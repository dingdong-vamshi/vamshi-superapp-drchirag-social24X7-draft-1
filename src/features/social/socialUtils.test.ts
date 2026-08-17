import assert from "node:assert/strict";
import test from "node:test";
import { flattenStoryGroups, groupStoriesByAuthor } from "./socialUtils.ts";
import type { SocialStory } from "./types.ts";

const story = (id: string, authorId: string, createdAt: string): SocialStory => ({
  id,
  author: { id: authorId, handle: authorId, displayName: authorId },
  contentType: "text",
  textContent: id,
  backgroundStyle: "forest",
  mediaType: null,
  createdAt,
  expiresAt: "2099-01-01T00:00:00.000Z",
});

test("groups every author's story items into one circle", () => {
  const groups = groupStoriesByAuthor([
    story("a2", "a", "2026-01-02T00:00:00.000Z"),
    story("b1", "b", "2026-01-01T00:00:00.000Z"),
    story("a1", "a", "2026-01-01T00:00:00.000Z"),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].stories.map(({ id }) => id), ["a1", "a2"]);
});

test("viewer advances through one author before the next", () => {
  const groups = groupStoriesByAuthor([
    story("a1", "a", "2026-01-01T00:00:00.000Z"),
    story("a2", "a", "2026-01-02T00:00:00.000Z"),
    story("b1", "b", "2026-01-03T00:00:00.000Z"),
  ]);
  assert.deepEqual(flattenStoryGroups(groups, "a").map(({ id }) => id), ["a1", "a2", "b1"]);
});
