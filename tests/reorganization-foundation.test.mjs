import test from "node:test";
import assert from "node:assert/strict";
import { APP_BUILD, SCREEN_IDS, isKnownScreen, versionLabel } from "../modules/app-core.js";
import { registerScreen, loadScreen, registeredScreens } from "../modules/screen-loader.js";

test("Reorganization has a distinct version and branch label", () => {
  assert.equal(APP_BUILD.version, "0.4.0-reorg.11");
  assert.equal(APP_BUILD.channel, "Reorganization");
  assert.equal(APP_BUILD.production, false);
  assert.match(versionLabel(), /REORGANIZATION.*0\.4\.0-reorg\.11/);
  assert.equal(isKnownScreen("home"), true);
  assert.equal(isKnownScreen("clock"), true);
  assert.equal(isKnownScreen("unknown"), false);
  assert.equal(SCREEN_IDS.length, 8);
});

test("screen loader defers loading and caches a loaded screen", async () => {
  let calls = 0;
  registerScreen("phase1-test", async () => { calls++; return { render: () => "ok" }; });
  assert.equal(calls, 0);
  const [first, second] = await Promise.all([loadScreen("phase1-test"), loadScreen("phase1-test")]);
  assert.equal(calls, 1);
  assert.strictEqual(first, second);
  assert.ok(registeredScreens().includes("phase1-test"));
  await assert.rejects(loadScreen("not-registered"), /not registered/);
});

test("failed module loads can be retried", async () => {
  let calls = 0;
  registerScreen("phase1-retry", async () => {
    if (++calls === 1) throw new Error("Temporary failure");
    return { ready: true };
  });
  await assert.rejects(loadScreen("phase1-retry"), /Temporary failure/);
  assert.deepEqual(await loadScreen("phase1-retry"), { ready: true });
  assert.equal(calls, 2);
});

// Safeguard: never publish the outdated source build in place of the finished runtime.
test("published app retains finished Tournament Design and Management features", async () => {
 const {readFile} = await import("node:fs/promises");
 const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
 for (const marker of ["REORGANIZATION · v0.4.0-reorg.11", "Edit This Tournament", "Saved Structures", "Saved Layouts", "setup-library-layout", "show-structures", "show-layouts"]) {
  assert.ok(app.includes(marker), "Missing published feature: " + marker);
 }
});
