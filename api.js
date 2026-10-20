/*
 * Parents Go To — API client.
 *
 * window.PTGApi wraps fetch() for the backend: it adds the sign-in token,
 * turns error responses into PTGApi.Error objects with a readable message,
 * and announces "ptg:unauthorized" when the server says the session has
 * ended (password changed elsewhere, account suspended, token expired).
 *
 * Load order: config.js, then this file, then sync.js, then everything else.
 */
(function() {
  "use strict";
  var TOKEN_KEY = "ptg-token-v1";
  var TIMEOUT_MS = 15000;
  var cfg = window.PTG_CONFIG || {};
  var base = String(cfg.apiBase || "").replace(/\/+$/, "");
  var configured = !!base && base.indexOf("REPLACE-WITH-YOUR-API-HOST") === -1;

  function storage(kind) {
    try {
      return window[kind];
    } catch (e) {
      return null;
    }
  }

  function readToken() {
    var kinds = [ "sessionStorage", "localStorage" ];
    for (var i = 0; i < kinds.length; i++) {
      var s = storage(kinds[i]);
      try {
        var v = s ? s.getItem(TOKEN_KEY) : null;
        if (v) {
          return v;
        }
      } catch (e) {}
    }
    return null;
  }

  function clearToken() {
    [ "sessionStorage", "localStorage" ].forEach(function(kind) {
      var s = storage(kind);
      try {
        if (s) {
          s.removeItem(TOKEN_KEY);
        }
      } catch (e) {}
    });
  }

  // remember=true keeps the token after the browser closes ("Keep me signed in").
  function writeToken(token, remember) {
    clearToken();
    var s = storage(remember ? "localStorage" : "sessionStorage");
    try {
      if (s && token) {
        s.setItem(TOKEN_KEY, token);
      }
    } catch (e) {}
  }

  function rememberedToken() {
    var s = storage("localStorage");
    try {
      return !!(s && s.getItem(TOKEN_KEY));
    } catch (e) {
      return false;
    }
  }

  function ApiError(status, data, message) {
    this.name = "PTGApiError";
    this.status = status;
    this.data = data || {};
    this.code = this.data.code || "";
    this.message = message || this.data.message || (status ? "Request failed (" + status + ")" : "Can't reach the server");
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function fire(name, detail) {
    var ev;
    try {
      ev = new window.CustomEvent(name, {
        detail: detail || null
      });
    } catch (e) {
      ev = document.createEvent("CustomEvent");
      ev.initCustomEvent(name, false, false, detail || null);
    }
    window.dispatchEvent(ev);
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    if (!configured) {
      return Promise.reject(new ApiError(0, null, "The site isn't connected to its server yet (see config.js)."));
    }
    var headers = {
      Accept: "application/json"
    };
    var init = {
      method: method,
      headers: headers,
      cache: "no-store"
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    // opts.token pins a specific token (used while signing out, so the last
    // changes are sent as the person who made them).
    var token = opts.auth === false ? null : opts.token || readToken();
    if (token) {
      headers.Authorization = "Bearer " + token;
    }
    if (opts.keepalive) {
      init.keepalive = true;
    }
    var timer = null;
    if (window.AbortController) {
      var controller = new window.AbortController();
      init.signal = controller.signal;
      timer = window.setTimeout(function() {
        controller.abort();
      }, opts.timeout || TIMEOUT_MS);
    }
    return window.fetch(base + path, init).then(function(res) {
      window.clearTimeout(timer);
      fire("ptg:online", {
        online: true
      });
      if (opts.raw && res.ok) {
        return res;
      }
      return res.text().then(function(text) {
        var data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = {
              message: text.slice(0, 200)
            };
          }
        }
        if (res.ok) {
          return data;
        }
        var err = new ApiError(res.status, data);
        // The token stopped working: tell the session code to sign out.
        if (token && !opts.quietAuth && (res.status === 401 || res.status === 403 && /suspended/i.test(err.message))) {
          fire("ptg:unauthorized", {
            status: res.status,
            message: err.message
          });
        }
        throw err;
      });
    }, function() {
      window.clearTimeout(timer);
      fire("ptg:online", {
        online: false
      });
      throw new ApiError(0, null, "Can't reach the server. Check your connection and try again.");
    });
  }

  function enc(v) {
    return encodeURIComponent(String(v == null ? "" : v));
  }

  // A readable message for an error, with a fallback for unexpected ones.
  function errorMessage(err, fallback) {
    if (!err) {
      return fallback || "Something went wrong.";
    }
    if (err.status === 0) {
      return err.message;
    }
    if (err.status === 429) {
      return err.message || "Too many attempts. Wait a little and try again.";
    }
    if (err.status >= 500) {
      return fallback || "The server had a problem. Try again in a moment.";
    }
    return err.message || fallback || "Something went wrong.";
  }

  var Api = {
    enabled: configured,
    base: base,
    Error: ApiError,
    enc: enc,
    token: readToken,
    setToken: writeToken,
    clearToken: clearToken,
    remembered: rememberedToken,
    request: request,
    errorMessage: errorMessage,
    get: function(path, opts) {
      return request("GET", path, undefined, opts);
    },
    post: function(path, body, opts) {
      return request("POST", path, body === undefined ? {} : body, opts);
    },
    put: function(path, body, opts) {
      return request("PUT", path, body === undefined ? {} : body, opts);
    },
    patch: function(path, body, opts) {
      return request("PATCH", path, body === undefined ? {} : body, opts);
    },
    del: function(path, body, opts) {
      return request("DELETE", path, body, opts);
    }
  };

  Api.auth = {
    // Resolves { token, user } or { codeRequired: true, challenge } for admins.
    login: function(email, password, role) {
      return Api.post("/api/auth/login", {
        email: email,
        password: password,
        role: role
      }, {
        auth: false
      });
    },
    adminCode: function(challenge, code) {
      return Api.post("/api/auth/admin-code", {
        challenge: challenge,
        code: code
      }, {
        auth: false
      });
    },
    register: function(name, email, password) {
      return Api.post("/api/auth/register", {
        name: name,
        email: email,
        password: password,
        role: "parent"
      }, {
        auth: false
      });
    },
    forgot: function(email) {
      return Api.post("/api/auth/forgot-password", {
        email: email
      }, {
        auth: false
      });
    },
    me: function() {
      return Api.get("/api/auth/me");
    },
    logout: function(token) {
      return Api.post("/api/auth/logout", {}, {
        keepalive: true,
        quietAuth: true,
        token: token
      });
    },
    updateMe: function(patch) {
      return Api.patch("/api/auth/me", patch);
    },
    changePassword: function(currentPassword, newPassword) {
      return Api.put("/api/auth/password", {
        currentPassword: currentPassword,
        newPassword: newPassword
      }, {
        quietAuth: true
      });
    },
    deleteMe: function(password) {
      return Api.del("/api/auth/me", {
        password: password
      }, {
        quietAuth: true
      });
    }
  };

  Api.admin = {
    users: function() {
      return Api.get("/api/admin/users");
    },
    setStatus: function(id, status) {
      return Api.patch("/api/admin/users/" + enc(id) + "/status", {
        status: status
      });
    },
    tempPassword: function(id, password) {
      return Api.post("/api/admin/users/" + enc(id) + "/temp-password", {
        password: password
      });
    },
    remove: function(id) {
      return Api.del("/api/admin/users/" + enc(id));
    }
  };

  // A copy of the client whose requests always use one particular token.
  Api.withToken = function(token) {
    var pin = function(opts) {
      var o = {};
      for (var k in opts || {}) {
        if (Object.prototype.hasOwnProperty.call(opts, k)) {
          o[k] = opts[k];
        }
      }
      if (o.auth !== false && token) {
        o.token = token;
        o.quietAuth = true;
      }
      return o;
    };
    return {
      enc: enc,
      errorMessage: errorMessage,
      get: function(path, opts) {
        return Api.get(path, pin(opts));
      },
      post: function(path, body, opts) {
        return Api.post(path, body, pin(opts));
      },
      put: function(path, body, opts) {
        return Api.put(path, body, pin(opts));
      },
      patch: function(path, body, opts) {
        return Api.patch(path, body, pin(opts));
      },
      del: function(path, body, opts) {
        return Api.del(path, body, pin(opts));
      },
      auth: {
        me: function() {
          return Api.get("/api/auth/me", pin());
        }
      },
      admin: {
        users: function() {
          return Api.get("/api/admin/users", pin());
        }
      }
    };
  };

  window.PTGApi = Api;
})();
