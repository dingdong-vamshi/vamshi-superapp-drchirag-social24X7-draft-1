import assert from "node:assert/strict";
import test from "node:test";

import type { ShopProduct } from "./shopRepository.ts";
import { defaultShopFilters, filterAndSortProducts } from "./shopFilters.ts";

const product = (id: string, pricePaise: number, category: ShopProduct["category"], inStock = true): ShopProduct => ({
  id, storefrontId: "store", storefrontName: "Store", storefrontSlug: "store", name: id, slug: id,
  brand: "Store", pricePaise, category, accent: "#fff", description: "", shortDescription: "", rating: 0,
  reviewCount: 0, inStock, inventory: inStock ? 1 : 0, sku: id, mediaUrls: [], tags: [], keywords: [],
});

const products = [product("mid", 70_000, "Everyday"), product("low", 45_000, "Wellness"), product("high", 90_000, "Everyday", false)];

test("combines price, category and stock filters", () => {
  const result = filterAndSortProducts(products, { ...defaultShopFilters, minPricePaise: 60_000, maxPricePaise: 80_000, category: "Everyday", inStockOnly: true });
  assert.deepEqual(result.map((item) => item.id), ["mid"]);
});

test("sorts the actual filtered products numerically", () => {
  assert.deepEqual(filterAndSortProducts(products, { ...defaultShopFilters, sort: "price-asc" }).map((item) => item.pricePaise), [45_000, 70_000, 90_000]);
  assert.deepEqual(filterAndSortProducts(products, { ...defaultShopFilters, sort: "price-desc" }).map((item) => item.pricePaise), [90_000, 70_000, 45_000]);
});
