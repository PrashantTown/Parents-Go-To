"use strict";

self.addEventListener("install", function(event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", function(event) {
  var data = event.notification && event.notification.data || {};
  var go = data.go || "";
  event.notification.close();
  event.waitUntil(self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  }).then(function(list) {
    var i, client;
    for (i = 0; i < list.length; i++) {
      client = list[i];
      // Only the app page listens for "ptg:open"; the marketing pages share this scope.
      if ("focus" in client && /reading-for-pleasure\.html/.test(client.url)) {
        client.postMessage({
          type: "ptg:open",
          go: go
        });
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(go ? "reading-for-pleasure.html#" + go : "reading-for-pleasure.html");
    }
    return undefined;
  }));
});

self.addEventListener("push", function(event) {
  var payload = {
    title: "Parents Go To",
    body: "",
    go: ""
  };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text();
    }
  }
  event.waitUntil(self.registration.showNotification(payload.title || "Parents Go To", {
    body: payload.body || "",
    tag: payload.tag || "ptg-push",
    data: {
      go: payload.go || ""
    }
  }));
});
