import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("Notification Center uses recipient-scoped newest-first data and realtime refresh", () => {
  const repository = read("./notificationRepository.ts");
  const screen = read("../social/SocialScreen.tsx");

  assert.match(repository, /\.eq\(["']recipient_id["'], viewerId\)/);
  assert.match(
    repository,
    /\.order\(["']created_at["'], \{ ascending: false \}\)/,
  );
  assert.match(
    repository,
    /groups\.flat\(\)\.sort\(\(left, right\) => right\.createdAt\.localeCompare\(left\.createdAt\)\)/,
  );
  assert.match(repository, /postgres_changes/);
  assert.match(repository, /filter: `recipient_id=eq\.\$\{viewerId\}`/);
  assert.match(
    screen,
    /notificationCount=\{notifications\.filter\(\(item\) => !item\.readAt\)\.length\}/,
  );
  assert.match(screen, /notificationRepository\?\.markAllRead\(\)/);
  assert.match(screen, /notificationRepository\?\.markRead\(item\)/);
  assert.match(screen, /onOpenNotification\?\.\(item\)/);
});
