import assert from "node:assert/strict";
import test from "node:test";

import { insetCropRect } from "./documentScannerUtils.ts";

test("document crop trims all four edges without exceeding the page", () => {
  assert.deepEqual(insetCropRect(1000, 1500), {
    originX: 40,
    originY: 60,
    width: 920,
    height: 1380,
  });
});

test("document crop rejects invalid dimensions and clamps unsafe fractions", () => {
  assert.throws(() => insetCropRect(0, 100), /valid image size/i);
  const cropped = insetCropRect(100, 100, 0.9);
  assert.deepEqual(cropped, { originX: 45, originY: 45, width: 10, height: 10 });
});
