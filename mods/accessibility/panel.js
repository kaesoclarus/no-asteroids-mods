/* Accessibility pack: settings panel (F10) and UI scaling. */
(function () {
  "use strict";
  var ID = "accessibility";
  var A = window.__naA11y;
  var store = window.NAMods.storage(ID);
  var log = window.NAMods.log(ID);
  var settings = store.load({
    palette: "default", uiScale: 1, custom: {}, hintShown: false, textures: true,
    patterns: false, patternStrength: 1, bloom: 1, plainFont: false, screenText: 1
  });

  var SCALES = [1, 1.15, 1.3, 1.5, 1.75];
  var BLOOMS = [[1, "100%"], [0.75, "75%"], [0.5, "50%"], [0.25, "25%"], [0, "Off"]];
  var STRENGTHS = [[1, "Bold"], [0.55, "Subtle"]];
  var SCREEN_TEXT = [1, 1.15, 1.3];
  var GLOWING = [
    ["ice", "Ice", "#7cc4ff"], ["neutronium", "Neutronium", "#8fd0ff"], ["crystal", "Crystal", "#a46bff"],
    ["darkMatter", "Dark matter", "#c9a8ff"], ["plasmite", "Plasmite", "#ff7a28"], ["antimatter", "Antimatter", "#ff4fa8"]
  ];

  // ---- UI scale: the game's UI is sized in rem, so the root font size scales it (live, no restart)
  function applyScale() {
    var s = Number(settings.uiScale) || 1;
    document.documentElement.style.fontSize = s === 1 ? "" : (16 * s).toFixed(2) + "px";
  }
  applyScale();

  // ---- text: a plainer font for the game's display font (Tektur), and larger text on the station's screens.
  // The station screens are fixed-size panels in the 3D world, sized in px, so the interface size doesn't reach them.
  var textStyle = document.createElement("style");
  textStyle.id = "na11y-text";
  function applyText() {
    var css = "";
    if (settings.plainFont) {
      css += ':root{--f-display:"Inter","Noto Sans Arabic",var(--f-cjk),system-ui,sans-serif !important}' +
        "html.na11y-plain *{letter-spacing:0.02em !important}";
    }
    document.documentElement.classList.toggle("na11y-plain", !!settings.plainFont);
    var k = Number(settings.screenText) || 1;
    if (k !== 1) {
      css += ".st-screen{font-size:" + (16 * k).toFixed(1) + "px !important}" +
        ".ws-screen{font-size:" + (34 * k).toFixed(1) + "px !important}";
    }
    textStyle.textContent = css;
    if (!textStyle.parentNode) (document.head || document.documentElement).appendChild(textStyle);
  }
  applyText();

  function save() {
    store.save(settings).catch(function (e) { log("could not save settings:", e); });
  }

  // ---- panel
  var panel = null, open = false;

  function swatches(key) {
    var p = key === "custom" ? { ores: settings.custom || {} } : A.palettes[key];
    return GLOWING.map(function (o) {
      var c = (p && p.ores && p.ores[o[0]] && p.ores[o[0]].glow) || o[2];
      return '<span class="na11y-sw" title="' + o[1] + '"><i style="background:' + c + ';box-shadow:0 0 .5rem ' + c + '"></i>' + o[1] + "</span>";
    }).join("");
  }

  function patchStatus() {
    var mine = window.NAMods.patchReport().filter(function (r) { return r.mod === ID; });
    if (!mine.length) return "Ore colour patches haven't loaded yet.";
    var bad = mine.filter(function (r) { return !r.applied; });
    if (!bad.length) return "Ore colour patches: all " + mine.length + " applied.";
    return "Ore colour patches: " + bad.length + " of " + mine.length + " did not apply (a game update may have changed them): " +
      bad.slice(0, 4).map(function (r) { return r.id; }).join(", ") + (bad.length > 4 ? "…" : "");
  }

  // ---- live palette switching (no restart)
  var applying = false, applyNote = "";
  function applyLive() {
    applying = true; applyNote = "";
    if (open) render();
    // let the panel paint "Applying…" before the (up to ~1.5 s) texture work starts
    setTimeout(function () {
      A.apply(settings).then(function (r) {
        applying = false;
        applyNote = r.error ? "Ore colours changed, but the surfaces could not be recoloured: " + r.error
          : "Applied" + (r.textures ? ", ore surfaces recoloured" : "") + " (" + r.ms + " ms).";
        if (open) render();
      });
    }, 50);
  }

  function render() {
    var pal = settings.palette;
    var keys = Object.keys(A.palettes);
    if (settings.custom && Object.keys(settings.custom).length) keys.push("custom");
    var rows = keys.map(function (k) {
      var p = k === "custom" ? { name: "Custom", note: "Your colours from settings.json." } : A.palettes[k];
      return '<label class="na11y-pal' + (pal === k ? " on" : "") + '"><input type="radio" name="na11y-pal" value="' + k + '"' +
        (pal === k ? " checked" : "") + "><b>" + p.name + "</b>" + (p.note ? "<small>" + p.note + "</small>" : "") +
        '<span class="na11y-sws">' + swatches(k) + "</span></label>";
    }).join("");
    var texWanted = settings.textures !== false;
    var restart = applying ? '<p class="na11y-warn">Applying…</p>'
      : applyNote ? '<p class="na11y-dim">' + applyNote + "</p>" : "";
    var texInfo = A.atlasInfo && A.atlasInfo.error ? " (could not recolour: " + A.atlasInfo.error + ")" : "";
    rows += '<label class="na11y-pal na11y-tex"><input type="checkbox" id="na11y-tex"' + (texWanted ? " checked" : "") +
      (applying ? " disabled" : "") +
      "><b>Recolour ore surfaces too</b><small>Strongest effect. Uses about 85 MB more video memory; switching takes about a second." +
      texInfo + "</small></label>";
    var scales = SCALES.map(function (s) {
      return '<button type="button" data-scale="' + s + '"' + (Number(settings.uiScale) === s ? ' class="on"' : "") + ">" + Math.round(s * 100) + "%</button>";
    }).join("");
    var map = A.patternMap || {};
    var pats = GLOWING.map(function (o) {
      var p = map[o[0]] || "none";
      return '<span class="na11y-sw" title="' + o[1] + ": " + p + '"><i class="na11y-pat na11y-pat-' + p + '"></i>' + o[1] + " <small>(" + p + ")</small></span>";
    }).join("");
    var patOn = !!settings.patterns;
    var strengths = buttons("strength", STRENGTHS, Number(settings.patternStrength), !patOn);
    var blooms = buttons("bloom", BLOOMS, Number(settings.bloom), false);
    var screenText = buttons("screen", SCREEN_TEXT.map(function (s) { return [s, Math.round(s * 100) + "%"]; }), Number(settings.screenText) || 1, false);

    panel.innerHTML =
      '<div class="na11y-box" role="dialog" aria-label="Accessibility settings">' +
      '<header><h2>Accessibility</h2><button type="button" class="na11y-x" aria-label="Close">×</button></header>' +
      "<h3>Ore colours</h3>" + rows + restart +
      "<h3>Ore patterns</h3>" +
      '<label class="na11y-pal' + (patOn ? " on" : "") + '"><input type="checkbox" id="na11y-pat"' + (patOn ? " checked" : "") +
      "><b>Draw a pattern on each glowing ore</b><small>Tells ores apart by shape, not colour. Works with any palette.</small>" +
      '<span class="na11y-sws">' + pats + "</span></label>" +
      '<div class="na11y-scales">' + strengths + "</div>" +
      "<h3>Glow halo</h3><div class=\"na11y-scales\">" + blooms + "</div>" +
      '<p class="na11y-dim">The soft halo around bright ores and lights. Lower it for less glare. The game\'s own settings have Camera shake, Impact flashes and Field of view.</p>' +
      "<h3>Interface size</h3><div class=\"na11y-scales\">" + scales + "</div>" +
      '<p class="na11y-dim">Applies right away. Very large sizes can crowd some screens.</p>' +
      "<h3>Text</h3>" +
      '<label class="na11y-pal' + (settings.plainFont ? " on" : "") + '"><input type="checkbox" id="na11y-font"' + (settings.plainFont ? " checked" : "") +
      "><b>Easier-to-read font</b><small>Swaps the game's angular title font for a plain one with normal letter spacing. A few labels drawn in 3D update after a restart.</small></label>" +
      '<p class="na11y-dim">Text on the station\'s computer screens:</p><div class="na11y-scales">' + screenText + "</div>" +
      '<p class="na11y-dim">' + patchStatus() + "</p>" +
      '<footer>F10 or Esc to close · Accessibility Pack ' + (window.NAMods.get(ID) || {}).version + "</footer></div>";

    panel.querySelector(".na11y-x").onclick = toggle;
    Array.prototype.forEach.call(panel.querySelectorAll('input[name="na11y-pal"]'), function (r) {
      r.disabled = applying;
      r.onchange = function () { settings.palette = r.value; save(); applyLive(); };
    });
    var texBox = panel.querySelector("#na11y-tex");
    if (texBox) texBox.onchange = function () { settings.textures = texBox.checked; save(); applyLive(); };
    Array.prototype.forEach.call(panel.querySelectorAll("[data-scale]"), function (b) {
      b.onclick = function () { settings.uiScale = Number(b.getAttribute("data-scale")); applyScale(); save(); render(); };
    });
    var patBox = panel.querySelector("#na11y-pat");
    patBox.onchange = function () { settings.patterns = patBox.checked; save(); applyQuick(); };
    var fontBox = panel.querySelector("#na11y-font");
    fontBox.onchange = function () { settings.plainFont = fontBox.checked; save(); applyText(); render(); };
    Array.prototype.forEach.call(panel.querySelectorAll("[data-strength]"), function (b) {
      b.onclick = function () { settings.patternStrength = Number(b.getAttribute("data-strength")); save(); applyQuick(); };
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-bloom]"), function (b) {
      b.onclick = function () { settings.bloom = Number(b.getAttribute("data-bloom")); save(); applyQuick(); };
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-screen]"), function (b) {
      b.onclick = function () { settings.screenText = Number(b.getAttribute("data-screen")); save(); applyText(); render(); };
    });
  }

  function buttons(kind, list, current, disabled) {
    return list.map(function (x) {
      return '<button type="button" data-' + kind + '="' + x[0] + '"' + (current === x[0] ? ' class="on"' : "") +
        (disabled ? " disabled" : "") + ">" + x[1] + "</button>";
    }).join("");
  }

  // patterns and glow halo only change shader uniforms: instant, so they skip the "Applying…" step
  function applyQuick() {
    A.extras(settings);
    if (open) render();
  }

  function toggle() {
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "na11y";
      // keep clicks and scrolls in the panel away from the game (it would grab the mouse)
      ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "wheel", "contextmenu"].forEach(function (t) {
        panel.addEventListener(t, function (e) { e.stopPropagation(); });
      });
      document.body.appendChild(panel);
    }
    open = !open;
    if (open) {
      render();
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      panel.classList.add("open");
      var first = panel.querySelector("input:checked") || panel.querySelector("button");
      if (first) first.focus();
    } else {
      panel.classList.remove("open");
    }
  }

  // Registered before the game's own listeners, so while the panel is open the game doesn't see key presses.
  function keys(e) {
    if (e.code === "F10") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "keydown" && !e.repeat) toggle();
      return;
    }
    if (!open) return;
    if (e.code === "Escape" && e.type === "keydown") toggle();
    e.stopImmediatePropagation();
    if (e.code === "Escape") e.preventDefault();
  }
  window.addEventListener("keydown", keys, true);
  window.addEventListener("keyup", keys, true);

  window.NAMods.ready(function () {
    if (settings.hintShown) return;
    var t = document.createElement("div");
    t.className = "na11y-hint";
    t.textContent = "Accessibility Pack installed: press F10 for ore colours, ore patterns, glow and text size.";
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("gone"); }, 9000);
    setTimeout(function () { t.remove(); }, 11000);
    settings.hintShown = true;
    save();
  });

  log("palette:", A.choice, "ui scale:", settings.uiScale);
})();
