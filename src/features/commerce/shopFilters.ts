import type { ShopCategory, ShopProduct } from "./shopRepository";

export type ShopSort = "default" | "price-asc" | "price-desc";
export type ShopFilterState = {
  minPricePaise: number | null;
  maxPricePaise: number | null;
  category: ShopCategory;
  inStockOnly: boolean;
  sort: ShopSort;
};

export const defaultShopFilters: ShopFilterState = {
  minPricePaise: null,
  maxPricePaise: null,
  category: "All",
  inStockOnly: false,
  sort: "default",
};

export function filterAndSortProducts(products: ShopProduct[], filters: ShopFilterState) {
  const filtered = products.filter((product) => {
    if (filters.minPricePaise !== null && product.pricePaise < filters.minPricePaise) return false;
    if (filters.maxPricePaise !== null && product.pricePaise > filters.maxPricePaise) return false;
    if (filters.category !== "All" && product.category !== filters.category) return false;
    if (filters.inStockOnly && !product.inStock) return false;
    return true;
  });
  if (filters.sort === "price-asc") return [...filtered].sort((a, b) => a.pricePaise - b.pricePaise || a.name.localeCompare(b.name));
  if (filters.sort === "price-desc") return [...filtered].sort((a, b) => b.pricePaise - a.pricePaise || a.name.localeCompare(b.name));
  return filtered;
}

export function activeShopFilterCount(filters: ShopFilterState) {
  return Number(filters.minPricePaise !== null || filters.maxPricePaise !== null)
    + Number(filters.category !== "All")
    + Number(filters.inStockOnly)
    + Number(filters.sort !== "default");
}
