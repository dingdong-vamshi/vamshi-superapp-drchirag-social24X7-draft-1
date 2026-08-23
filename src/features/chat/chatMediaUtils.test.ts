import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeChatMedia,
  normalizeImagePickerDurationMs,
  readWebMediaBlob,
} from "./chatMediaUtils.ts";

test("normalizes MediaRecorder codec MIME parameters and filename", () => {
  assert.deepEqual(normalizeChatMedia({
    filename: "recording",
    mimeType: "video/webm;codecs=vp8,opus",
    kind: "video",
    fallbackStem: "camera-1",
  }), { filename: "recording.webm", mimeType: "video/webm" });
});

test("normalizes mobile camera M4V aliases to the accepted MP4 upload type", () => {
  assert.deepEqual(normalizeChatMedia({
    filename: "capture.M4V",
    mimeType: "video/x-m4v",
    kind: "video",
    fallbackStem: "camera-2",
  }), { filename: "capture.mp4", mimeType: "video/mp4" });
});

test("infers a missing iOS camera MIME type from the MOV filename", () => {
  assert.deepEqual(normalizeChatMedia({
    filename: "capture.mov",
    mimeType: "",
    kind: "video",
    fallbackStem: "camera-3",
  }), { filename: "capture.mov", mimeType: "video/quicktime" });
});

test("rejects an unsupported camera video type before upload", () => {
  assert.throws(() => normalizeChatMedia({
    filename: "capture.mkv",
    mimeType: "video/x-matroska",
    kind: "video",
    fallbackStem: "camera-4",
  }), /unsupported video format/);
});

test("reads a complete non-empty MediaRecorder-style Blob", async () => {
  const bytes = await readWebMediaBlob(new Blob([new Uint8Array([1, 2, 3])], { type: "video/webm" }));
  assert.equal(bytes.byteLength, 3);
  await assert.rejects(readWebMediaBlob(new Blob([], { type: "video/webm" })), /empty/);
});

test("converts SDK 57 web video duration seconds to integer milliseconds", () => {
  assert.equal(normalizeImagePickerDurationMs(3.482, "web"), 3482);
});

test("keeps native ImagePicker duration in milliseconds and rounds for the integer RPC", () => {
  assert.equal(normalizeImagePickerDurationMs(3482.4, "native"), 3482);
});

test("omits invalid ImagePicker duration metadata", () => {
  assert.equal(normalizeImagePickerDurationMs(undefined, "web"), undefined);
  assert.equal(normalizeImagePickerDurationMs(Number.NaN, "web"), undefined);
  assert.equal(normalizeImagePickerDurationMs(-1, "native"), undefined);
});
