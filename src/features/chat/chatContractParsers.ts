export type ParsedOrderEventType =
  | "order_confirmed"
  | "order_processing"
  | "order_shipped"
  | "order_out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "order_refunded";

const orderEventTypes = new Set<ParsedOrderEventType>([
  "order_confirmed",
  "order_processing",
  "order_shipped",
  "order_out_for_delivery",
  "order_delivered",
  "order_cancelled",
  "return_requested",
  "return_approved",
  "return_rejected",
  "order_refunded",
]);

const isUuid = (value?: string | null) =>
  Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
const stringValue = (value: unknown) => typeof value === "string" ? value : "";
const numberValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

export const toOrderEvent = (payload: Record<string, unknown>) => {
  const eventType = stringValue(payload.event_type) as ParsedOrderEventType;
  const orderId = stringValue(payload.order_id);
  if (payload.version !== 1 || !orderEventTypes.has(eventType) || !isUuid(orderId)) return undefined;

  const items = Array.isArray(payload.items)
    ? payload.items.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Record<string, unknown>;
        const orderItemId = stringValue(item.order_item_id);
        if (!isUuid(orderItemId)) return [];
        return [{
          orderItemId,
          productId: stringValue(item.product_id) || undefined,
          title: stringValue(item.title) || "Product",
          slug: stringValue(item.slug),
          quantity: numberValue(item.quantity),
          unitPriceMinor: numberValue(item.unit_price_minor),
          subtotalMinor: numberValue(item.subtotal_minor),
        }];
      })
    : [];

  return {
    version: 1 as const,
    eventType,
    orderId,
    orderStatus: stringValue(payload.order_status),
    storefrontId: stringValue(payload.storefront_id),
    storefrontName: stringValue(payload.storefront_name) || "Store",
    storefrontSlug: stringValue(payload.storefront_slug),
    currency: stringValue(payload.currency) || "INR",
    subtotalMinor: numberValue(payload.subtotal_minor),
    totalMinor: numberValue(payload.total_minor),
    paymentMethod: stringValue(payload.payment_method),
    paymentStatus: stringValue(payload.payment_status),
    placedAt: stringValue(payload.placed_at),
    items,
    carrier: stringValue(payload.carrier) || undefined,
    trackingNumber: stringValue(payload.tracking_number) || undefined,
    packageReference: stringValue(payload.package_reference) || undefined,
    customerNote: stringValue(payload.customer_note) || undefined,
  };
};

export const toAttachment = (payload: Record<string, unknown>) => {
  const id = stringValue(payload.attachment_id);
  const attachmentType = stringValue(payload.attachment_type);
  const source = stringValue(payload.source);
  if (!isUuid(id) || !["image", "video", "document"].includes(attachmentType)) return undefined;
  if (!["camera_capture", "gallery", "document_picker", "document_scan"].includes(source)) return undefined;
  return {
    id,
    attachmentType: attachmentType as "image" | "video" | "document",
    filename: stringValue(payload.filename) || "attachment",
    mimeType: stringValue(payload.mime_type),
    bytes: numberValue(payload.bytes),
    width: numberValue(payload.width) || undefined,
    height: numberValue(payload.height) || undefined,
    durationMs: numberValue(payload.duration_ms) || undefined,
    source: source as "camera_capture" | "gallery" | "document_picker" | "document_scan",
  };
};

export const toLocation = (payload: Record<string, unknown>) => {
  if (payload.version !== 1) return undefined;
  const latitude = numberValue(payload.latitude);
  const longitude = numberValue(payload.longitude);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return {
    latitude,
    longitude,
    accuracy: numberValue(payload.accuracy) || undefined,
    label: stringValue(payload.label) || undefined,
    capturedAt: stringValue(payload.captured_at),
  };
};
