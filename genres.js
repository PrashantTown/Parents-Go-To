(function() {
  "use strict";
  var KEY = "ptg-genres-v1";
  var CATALOGUE = [ {
    value: "picture-books",
    label: "Picture books"
  }, {
    value: "bedtime",
    label: "Bedtime stories"
  }, {
    value: "adventure",
    label: "Adventure"
  }, {
    value: "fantasy",
    label: "Fantasy and magic"
  }, {
    value: "animals",
    label: "Animals and nature"
  }, {
    value: "funny",
    label: "Funny stories"
  }, {
    value: "mystery",
    label: "Mystery and detective"
  }, {
    value: "science",
    label: "Science and space"
  }, {
    value: "history",
    label: "History"
  }, {
    value: "comics",
    label: "Comics and graphic novels"
  }, {
    value: "poetry",
    label: "Poetry and rhymes"
  }, {
    value: "real-lives",
    label: "Real lives"
  } ];
  var KNOWN = {};
  var i;
  for (i = 0; i < CATALOGUE.length; i++) {
    KNOWN[CATALOGUE[i].value] = CATALOGUE[i].label;
  }
  function readAll() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }
  function writeAll(map) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      return false;
    }
  }
  function key(email) {
    return String(email || "").trim().toLowerCase();
  }
  function clean(list) {
    var out = [], seen = {}, n;
    if (Object.prototype.toString.call(list) !== "[object Array]") {
      return out;
    }
    for (n = 0; n < list.length; n++) {
      var v = String(list[n]);
      if (KNOWN[v] && !seen[v]) {
        seen[v] = 1;
        out.push(v);
      }
    }
    return out;
  }
  var API = {
    catalogue: function() {
      return CATALOGUE.slice();
    },
    get: function(email) {
      var k = key(email);
      if (!k) {
        return null;
      }
      var rec = readAll()[k];
      if (!rec) {
        return null;
      }
      return {
        genres: clean(rec.genres),
        skipped: rec.skipped === true,
        at: rec.at || 0
      };
    },
    list: function(email) {
      var rec = API.get(email);
      return rec ? rec.genres : [];
    },
    labels: function(email) {
      return API.list(email).map(function(v) {
        return KNOWN[v];
      });
    },
    asked: function(email) {
      return API.get(email) !== null;
    },
    save: function(email, genres) {
      var k = key(email);
      if (!k) {
        return false;
      }
      var all = readAll();
      all[k] = {
        genres: clean(genres),
        skipped: false,
        at: Date.now()
      };
      return writeAll(all);
    },
    skip: function(email) {
      var k = key(email);
      if (!k) {
        return false;
      }
      var all = readAll();
      all[k] = {
        genres: [],
        skipped: true,
        at: Date.now()
      };
      return writeAll(all);
    },
    forget: function(email) {
      var k = key(email);
      var all = readAll();
      if (k && all[k]) {
        delete all[k];
        return writeAll(all);
      }
      return false;
    }
  };
  window.PTGGenres = API;
})();
