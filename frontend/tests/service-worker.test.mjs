import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const serviceWorkerSource = await readFile(
  new URL("../public/questline-sw.js", import.meta.url),
  "utf8",
);

function createServiceWorker({ fetchImpl, offlinePage = new Response("offline page") }) {
  const listeners = new Map();
  const cached = [];
  const deleted = [];
  const context = {
    URL,
    Response,
    Promise,
    fetch: fetchImpl,
    self: {
      location: { origin: "https://questline.example" },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    },
    caches: {
      open: async (cacheName) => ({
        add: async (path) => cached.push({ cacheName, path }),
      }),
      keys: async () => ["questline-offline-v0", "unrelated-cache"],
      delete: async (cacheName) => deleted.push(cacheName),
      match: async () => offlinePage,
    },
  };

  vm.runInNewContext(serviceWorkerSource, context);
  return { listeners, cached, deleted };
}

test("install caches only the offline page and activation removes old Questline caches", async () => {
  const worker = createServiceWorker({ fetchImpl: async () => new Response("online") });
  let installPromise;
  worker.listeners.get("install")({ waitUntil: (promise) => (installPromise = promise) });
  await installPromise;

  let activatePromise;
  worker.listeners.get("activate")({ waitUntil: (promise) => (activatePromise = promise) });
  await activatePromise;

  assert.deepEqual(worker.cached, [{ cacheName: "questline-offline-v2", path: "/offline.html" }]);
  assert.deepEqual(worker.deleted, ["questline-offline-v0"]);
});

test("failed same-origin page navigations return the static offline page", async () => {
  const offlinePage = new Response("cached offline page");
  const worker = createServiceWorker({
    fetchImpl: async () => {
      throw new TypeError("network unavailable");
    },
    offlinePage,
  });
  let navigationResponse;
  worker.listeners.get("fetch")({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://questline.example/uncached-route",
    },
    respondWith: (promise) => (navigationResponse = promise),
  });

  assert.equal(await navigationResponse, offlinePage);
});

test("successful page navigations remain network-first", async () => {
  const onlineResponse = new Response("online page");
  const worker = createServiceWorker({ fetchImpl: async () => onlineResponse });
  let navigationResponse;
  worker.listeners.get("fetch")({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://questline.example/quests",
    },
    respondWith: (promise) => (navigationResponse = promise),
  });

  assert.equal(await navigationResponse, onlineResponse);
});

test("API reads, mutations, and cross-origin navigations are not intercepted", () => {
  const worker = createServiceWorker({ fetchImpl: async () => new Response("online") });
  const requests = [
    { method: "GET", mode: "cors", url: "https://questline.example/api/quests" },
    {
      method: "POST",
      mode: "navigate",
      url: "https://questline.example/api/quests/1/complete",
    },
    { method: "GET", mode: "navigate", url: "https://other.example/page" },
  ];

  for (const request of requests) {
    let intercepted = false;
    worker.listeners.get("fetch")({
      request,
      respondWith: () => (intercepted = true),
    });
    assert.equal(intercepted, false, `${request.method} ${request.url} was intercepted`);
  }
});
