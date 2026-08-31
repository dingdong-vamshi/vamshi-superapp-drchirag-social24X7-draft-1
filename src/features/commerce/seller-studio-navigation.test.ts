import assert from "node:assert/strict";
import test from "node:test";

import {
  isSellerSection,
  sellerGroupForSection,
  sellerNavigation,
  sellerSectionLabel,
  toggleSellerNavigationGroup,
} from "./seller-studio-navigation.ts";

test("Seller Studio exposes the requested hierarchy without a flat module list", () => {
  assert.deepEqual(sellerNavigation.filter((group) => !group.utility).map((group) => group.label), [
    "Home", "Orders", "Products", "Logistics", "Marketing", "Affiliate", "LIVE & Video",
    "Growth", "Apps & Partners", "Analytics", "Account Health", "Finance",
  ]);
  assert.deepEqual(sellerNavigation.find((group) => group.key === "orders")?.children.map((item) => item.label), [
    "Manage Orders", "Manage Returns", "Return Settings",
  ]);
  assert.deepEqual(sellerNavigation.find((group) => group.key === "products")?.children.map((item) => item.label), [
    "Add Products", "Manage Products", "Product Ratings", "Product Bundle", "Sales Accelerator", "Product Opportunities",
  ]);
  assert.deepEqual(sellerNavigation.find((group) => group.key === "logistics")?.children.map((item) => item.label), [
    "Overview", "Warehouses", "Fulfillment", "Shipping", "Fulfilled by Social24",
  ]);
});

test("Seller Studio submenu state is controlled only by explicit primary-item clicks", () => {
  assert.equal(toggleSellerNavigationGroup("", "orders", true), "orders");
  assert.equal(toggleSellerNavigationGroup("orders", "orders", true), "");
  assert.equal(toggleSellerNavigationGroup("orders", "products", true), "products");
  assert.equal(toggleSellerNavigationGroup("products", "home", false), "");
});

test("functional and Coming Soon routes are explicit and refresh-safe", () => {
  assert.equal(sellerGroupForSection("affiliate_products").key, "affiliate");
  assert.equal(sellerGroupForSection("creator_chat").key, "creator_chat");
  assert.equal(sellerSectionLabel("creator_chat"), "Creator Chats");
  assert.equal(sellerSectionLabel("orders_returns"), "Manage Returns");
  assert.equal(isSellerSection("products_manage"), true);
  assert.equal(isSellerSection("catalog"), false);
  assert.equal(sellerNavigation.find((group) => group.key === "account_health")?.children[0]?.status, "coming_soon");
  assert.equal(sellerNavigation.find((group) => group.key === "analytics")?.children[0]?.status, "functional");
});
