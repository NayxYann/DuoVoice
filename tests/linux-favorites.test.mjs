import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/startup-favorites.js", import.meta.url), "utf8");
const { createStartupFavorites } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("Linux startup connects to the first available favorite only", async () => {
  let connected = [];
  const helper = createStartupFavorites({
    enabled: () => true,
    favorites: () => [{ address: "10.0.0.1" }, { address: "10.0.0.2" }],
    discover: async () => [{ address: "10.0.0.2" }, { address: "10.0.0.1" }],
    connect: async address => { connected.push(address); return true; },
  });
  await helper.tick();
  await helper.tick();
  assert.deepEqual(connected, ["10.0.0.1"]);
  assert.equal(helper.active, false);
});

test("Linux startup retries an unavailable device and manual action stops retries", async () => {
  let now = 0;
  let calls = 0;
  let errors = 0;
  const helper = createStartupFavorites({
    enabled: () => true,
    favorites: () => [{ address: "10.0.0.1" }],
    discover: async () => [{ address: "10.0.0.1" }],
    connect: async () => { calls++; throw new Error("device unavailable"); },
    onError: () => errors++,
    now: () => now,
  });
  await helper.tick();
  now = 5000;
  await helper.tick();
  helper.stop();
  now = 20000;
  await helper.tick();
  assert.equal(calls, 2);
  assert.equal(errors, 2);
  assert.equal(helper.active, false);
});
