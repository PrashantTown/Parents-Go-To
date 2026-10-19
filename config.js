/*
 * Parents Go To — where the backend API lives.
 *
 * Local development: the site talks to the API on http://localhost:5000
 * (run `npm run dev` in the backend folder).
 *
 * Deployed site: put your deployed API address in DEPLOYED_API below, for
 * example "https://parents-go-to-api.onrender.com" (no trailing slash), and
 * add this site's address to CORS_ORIGINS in the backend's .env.
 */
(function() {
  "use strict";
  var DEPLOYED_API = "https://parents-go-to-api.onrender.com";

  var host = window.location.hostname;
  var local = window.location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);

  var defaults = {
    apiBase: local ? "http://localhost:5000" : DEPLOYED_API,
    // How often shared things (board, reviews, chat, notifications) refresh.
    pollSeconds: 20
  };

  var current = window.PTG_CONFIG || {};
  for (var k in defaults) {
    if (Object.prototype.hasOwnProperty.call(defaults, k) && current[k] === undefined) {
      current[k] = defaults[k];
    }
  }
  window.PTG_CONFIG = current;
})();
