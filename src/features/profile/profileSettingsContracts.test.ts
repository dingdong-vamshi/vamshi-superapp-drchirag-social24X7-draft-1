import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("every Profile settings row has a meaningful route or authenticated action", () => {
  const route = read("../../../app/(tabs)/profile.tsx");
  const screen = read("./ProfileScreen.tsx");

  assert.match(
    route,
    /onOpenOrders=\{\(\) => router\.push\(["']\/orders["']\)\}/,
  );
  assert.match(
    route,
    /onOpenSaved=\{\(\) => router\.push\(["']\/wishlist["']\)\}/,
  );
  assert.match(
    route,
    /onOpenCreatorCommerce=\{\(\) => router\.push\(["']\/commerce["']\)\}/,
  );
  assert.match(route, /notifications: ["']1["']/);
  for (const section of ["privacy", "location", "payments", "security"]) {
    assert.match(route, new RegExp(`section: ["']${section}["']`));
  }
  assert.match(
    route,
    /onOpenHelp=\{\(\) => router\.push\(["']\/support-feedback["']\)\}/,
  );
  assert.match(
    route,
    /await signOut\(\)[\s\S]*?router\.replace\(["']\/login["']\)/,
  );

  for (const title of [
    "Orders & purchases",
    "Saved content",
    "Creator Commerce",
    "Notifications",
    "Privacy & safety",
    "Location preferences",
    "Payments",
    "Security",
    "Help centre",
  ]) {
    assert.match(
      screen,
      new RegExp(`title="${title.replace(/[&]/g, "&")}"[\\s\\S]*?onPress=`),
    );
  }
});

test("buyer Orders use buyer-scoped real records and contextual details", () => {
  const screen = read("./BuyerOrdersScreen.tsx");
  const repository = read("../creatorCommerce/lifecycleRepository.ts");

  assert.match(repository, /listBuyerOrderItems/);
  assert.match(repository, /\.eq\(['"]buyer_id['"], userId\)/);
  assert.match(screen, /setSelected\(item\)/);
  assert.match(screen, /Order details/);
  assert.match(screen, /selected\.storefrontName/);
  assert.match(screen, /selected\.createdAt/);
});
