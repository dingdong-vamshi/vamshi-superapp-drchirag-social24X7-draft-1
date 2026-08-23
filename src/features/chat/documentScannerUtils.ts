export const insetCropRect = (width: number, height: number, fraction = 0.04) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("A valid image size is required for cropping.");
  }
  const safeFraction = Math.min(0.45, Math.max(0, fraction));
  const insetX = Math.max(1, Math.round(width * safeFraction));
  const insetY = Math.max(1, Math.round(height * safeFraction));
  return {
    originX: insetX,
    originY: insetY,
    width: Math.max(1, Math.round(width) - insetX * 2),
    height: Math.max(1, Math.round(height) - insetY * 2),
  };
};
