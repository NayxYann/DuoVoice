import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frontend = readFileSync(new URL("../src/linux.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const entryStart = backend.indexOf("pub fn run_linux()");
assert.notEqual(entryStart, -1, "Linux Tauri entry point exists");
const handlersStart = backend.indexOf(".invoke_handler(tauri::generate_handler![", entryStart);
const handlersEnd = backend.indexOf(".on_window_event(", handlersStart);
assert.ok(handlersStart !== -1 && handlersEnd > handlersStart, "Linux invoke handler can be inspected");
const registered = new Set(
  [...backend.slice(handlersStart, handlersEnd).matchAll(/(?:linux::)?([a-z][a-z0-9_]*)/g)]
    .map((match) => match[1]),
);
const invoked = new Set([...frontend.matchAll(/invoke\("([a-z][a-z0-9_]*)"/g)].map((match) => match[1]));

test("every Linux frontend command is registered by the Linux Tauri entry point", () => {
  const missing = [...invoked].filter((command) => !registered.has(command));
  assert.deepEqual(missing, [], `Unregistered Linux commands: ${missing.join(", ")}`);
});

test("Linux edition selects the Linux entry point in the default Cargo binary", () => {
  assert.match(backend, /#\[cfg\(feature = "linux-edition"\)\]\s*run_linux\(\);/);
  assert.match(backend, /#\[cfg\(not\(feature = "linux-edition"\)\)\]\s*run_windows\(\);/);
});
