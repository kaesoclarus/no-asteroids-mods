/* No Asteroids mod loader (page side). Runs before the game's own code. */
(function () {
  "use strict";
  var info = { mods: [], errors: [], loader: "?" };
  try {
    var x = new XMLHttpRequest();
    x.open("GET", "/__mods.json", false);
    x.send();
    if (x.status === 200) info = JSON.parse(x.responseText);
  } catch (e) {
    info.errors.push("mods list: " + e);
  }

  var api = (window.NAMods = {
    loader: info.loader,
    list: info.mods,
    errors: info.errors,
    /** a mod's entry from the list, or null */
    get: function (id) {
      for (var i = 0; i < info.mods.length; i++) if (info.mods[i].id === id) return info.mods[i];
      return null;
    },
    /** per-mod settings in mods/<id>/settings.json (also readable by workers and patches):
     *  load(defaults) -> object (synchronous), save(object) -> Promise */
    storage: function (id) {
      var url = "/__mods/" + encodeURIComponent(id) + "/settings.json";
      return {
        load: function (defaults) {
          var v = {};
          try {
            var x = new XMLHttpRequest();
            x.open("GET", url, false);
            x.send();
            if (x.status === 200) v = JSON.parse(x.responseText) || {};
          } catch (e) {}
          return Object.assign({}, defaults || {}, v);
        },
        save: function (v) {
          return fetch(url, { method: "PUT", body: JSON.stringify(v) }).then(function (r) {
            if (!r.ok) throw new Error("save failed: " + r.status);
          });
        }
      };
    },
    /** what each mod's text patches did: [{ mod, id, file, hits, applied, note }] */
    patchReport: function () {
      try {
        var x = new XMLHttpRequest();
        x.open("GET", "/__mods/patches.json", false);
        x.send();
        return JSON.parse(x.responseText);
      } catch (e) { return []; }
    },
    /** console logger prefixed with the mod id */
    log: function (id) {
      return function () {
        console.log.apply(console, ["[mod:" + id + "]"].concat([].slice.call(arguments)));
      };
    },
    /** run fn once the page body exists */
    ready: function (fn) {
      if (document.body) fn();
      else document.addEventListener("DOMContentLoaded", fn);
    }
  });

  var esc = function (s) { return String(s).replace(/[&"<>]/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); };
  info.mods.forEach(function (m) {
    m.styles.forEach(function (s) { document.write('<link rel="stylesheet" href="' + esc(s) + '">'); });
    m.scripts.forEach(function (s) { document.write('<script src="' + esc(s) + '"><\/script>'); });
  });

  if (info.errors.length) console.warn("[mods] problems:", info.errors);
  console.log("[mods] loader " + info.loader + ", loaded: " + (info.mods.map(function (m) { return m.id; }).join(", ") || "none"));

  // A small "Modded" tag so screenshots and bug reports show the game isn't stock.
  if (info.mods.length || info.errors.length) {
    api.ready(function () {
      var tag = document.createElement("div");
      tag.id = "namods-tag";
      tag.textContent = info.errors.length
        ? "Mods: " + info.mods.length + " loaded, " + info.errors.length + " problem(s) — see console (F12 if enabled)"
        : "Modded · " + info.mods.length + " mod" + (info.mods.length === 1 ? "" : "s");
      tag.style.cssText =
        "position:fixed;left:8px;bottom:6px;z-index:2147483647;font:12px/1.2 system-ui,sans-serif;" +
        "color:#fff;background:rgba(0,0,0,.55);padding:3px 7px;border-radius:4px;pointer-events:none;" +
        "transition:opacity 1.5s;opacity:.85";
      document.body.appendChild(tag);
      setTimeout(function () { tag.style.opacity = "0"; }, 12000);
    });
  }
})();
