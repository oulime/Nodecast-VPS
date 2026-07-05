const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  require.resolve("../public/assets/ios-native-fullscreen.js"),
  "utf8"
);

function createHarness({ throwOnEnter = false } = {}) {
  const documentListeners = new Map();
  const videoListeners = new Map();
  const calls = [];

  const video = {
    addEventListener(name, listener) {
      videoListeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (videoListeners.get(name) === listener) videoListeners.delete(name);
    },
    webkitEnterFullscreen() {
      calls.push("enter");
      if (throwOnEnter) throw new Error("native fullscreen unavailable");
    },
  };

  const button = { id: "live-ctl-fullscreen" };
  const context = {
    Element: function Element() {},
    Promise,
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    },
    screen: {
      orientation: {
        lock(value) {
          calls.push(`lock:${value}`);
          return Promise.resolve();
        },
        unlock() {
          calls.push("unlock");
        },
      },
    },
    document: {
      addEventListener(name, listener) {
        documentListeners.set(name, listener);
      },
      getElementById(id) {
        return id === "video" ? video : null;
      },
    },
  };
  context.window = context;

  vm.runInNewContext(source, context);

  const target = new context.Element();
  target.closest = () => button;
  const event = {
    target,
    preventDefault() {
      calls.push("prevent");
    },
    stopImmediatePropagation() {
      calls.push("stop");
    },
  };

  return { calls, documentListeners, event, videoListeners };
}

{
  const harness = createHarness();
  harness.documentListeners.get("click")(harness.event);

  assert.deepEqual(harness.calls, ["enter", "prevent", "stop"]);
  harness.videoListeners.get("webkitbeginfullscreen")();
  assert.deepEqual(harness.calls, [
    "enter",
    "prevent",
    "stop",
    "lock:landscape",
  ]);
  harness.videoListeners.get("webkitendfullscreen")();
  assert.equal(harness.calls.at(-1), "unlock");
}

{
  const harness = createHarness({ throwOnEnter: true });
  harness.documentListeners.get("click")(harness.event);

  assert.deepEqual(harness.calls, ["enter"]);
  assert.equal(harness.videoListeners.size, 0);
}

console.log("iOS native fullscreen behavior tests passed");
