import assert from "node:assert/strict";
import test from "node:test";
import { avatarCropGeometry, boundAvatarCrop, initialAvatarCrop, validAvatarDimensions, validateAvatarSource, zoomAvatarCrop } from "./avatar-crop";

test("avatar input validation retains existing type, size and dimension limits", () => {
  assert.equal(validateAvatarSource({ name: "portrait.png", type: "image/png", size: 1024 }), null);
  for (const file of [
    { name: "photo.svg", type: "image/svg+xml", size: 100 },
    { name: "photo.exe", type: "image/png", size: 100 },
    { name: "photo.png", type: "image/png", size: 0 },
    { name: "photo.png", type: "image/png", size: 1024 * 1024 + 1 },
  ]) assert.match(validateAvatarSource(file)!, /PNG, JPEG or WebP/);
  assert(validAvatarDimensions(2048, 2048));
  for (const [width, height] of [[0, 10], [10, 2049], [1.5, 20], [Infinity, 20], [NaN, 20]]) assert(!validAvatarDimensions(width!, height!));
});

test("avatar crop always covers the square and bounds panning at every quarter rotation", () => {
  for (const [width, height] of [[1200, 600], [600, 1200], [512, 512]]) {
    for (const rotation of [0, 90, 180, 270] as const) {
      const crop = { rotation, zoom: 2, x: 10000, y: -10000 };
      const geometry = avatarCropGeometry(width!, height!, crop);
      const rotated = rotation === 90 || rotation === 270;
      const renderedWidth = (rotated ? height! : width!) * geometry.scale;
      const renderedHeight = (rotated ? width! : height!) * geometry.scale;
      assert(renderedWidth >= 512 && renderedHeight >= 512);
      assert(Math.abs(geometry.x) <= (renderedWidth - 512) / 2);
      assert(Math.abs(geometry.y) <= (renderedHeight - 512) / 2);
      assert.deepEqual(boundAvatarCrop(width!, height!, crop), { rotation, zoom: 2, x: geometry.x, y: geometry.y });
    }
  }
});

test("avatar zoom retains the same center, clamps extremes and reset is immutable", () => {
  const initial = initialAvatarCrop();
  assert.deepEqual(avatarCropGeometry(1024, 512, initial), { scale: 1, zoom: 1, x: 0, y: 0 });
  const shifted = { ...initial, x: 64 };
  assert.equal(zoomAvatarCrop(1024, 512, shifted, 2).x, 128);
  assert.equal(zoomAvatarCrop(1024, 512, shifted, 10).zoom, 4);
  assert.equal(zoomAvatarCrop(1024, 512, shifted, 0).zoom, 1);
  assert.deepEqual(initial, initialAvatarCrop());
  assert.throws(() => avatarCropGeometry(10000, 1, initial), /2048/);
  assert.deepEqual(boundAvatarCrop(512, 512, { ...initial, zoom: NaN, x: Infinity, y: NaN }), initial);
});
