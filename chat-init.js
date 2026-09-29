(function() {
  "use strict";
  var UI = window.PTGChatBox;
  var S = window.PTGSession;
  if (!UI || !S) {
    return;
  }
  var built = false;
  function signedInParent() {
    return typeof S.isParent === "function" ? S.isParent() : typeof S.active === "function" && S.active() && S.role() === "parent";
  }
  function sync() {
    var btn = document.getElementById("chatBtn");
    if (!btn) {
      return;
    }
    var ok = signedInParent();
    btn.hidden = !ok;
    if (UI.recount) {
      UI.recount();
    }
    if (ok && !built) {
      UI.panel(btn);
      built = true;
      return;
    }
    if (!ok && built) {
      UI.closePanel();
    }
  }
  function boot() {
    sync();
    window.addEventListener("ptg:session", sync);
    window.addEventListener("ptg:auth", sync);
    window.setInterval(sync, 1500);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
