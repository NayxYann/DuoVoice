import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Import the browser module without depending on package.json module mode.
const moduleSource = readFileSync(new URL("../src/linux-state.js",import.meta.url),"utf8");
const {normalizePreferences,validIPv4} = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);
test("broken or outdated saved preferences cannot enable excessive gain",() => {
  for(const value of [null,[],{}, {volume:Infinity,intensity:NaN}, {volume:200,boost:false}]) {
    const prefs=normalizePreferences(value);
    assert.ok(prefs.volume >= 0 && prefs.volume <= 1);
    assert.ok(prefs.intensity >= 0 && prefs.intensity <= 1);
    assert.equal(prefs.language,"fr");
  }
});
test("saved audio settings and stable device identifiers survive restart",() => {
  const prefs=normalizePreferences({language:"en",input:"pulseaudio:alsa_input.usb",output:"pulseaudio:alsa_output.usb",volume:1.8,boost:true,muted:true,noise:true,intensity:0.42,trayEnabled:false});
  assert.deepEqual(normalizePreferences(JSON.parse(JSON.stringify(prefs))),prefs);
  assert.equal(prefs.volume,1.8);
  assert.equal(prefs.trayEnabled,false);
});
test("manual connection accepts IPv4 addresses and rejects malformed input",() => {
  for(const address of ["192.168.1.20","10.0.0.2"," 172.16.0.15 "]) assert.ok(validIPv4(address));
  for(const address of ["256.1.2.3","1.2.3","1.2.3.4.5","1e2.0.0.1","0.0.0.0","255.255.255.255","<script>","host.local",""]) assert.equal(validIPv4(address),false,address);
});
