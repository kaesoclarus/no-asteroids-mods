/* Accessibility pack: ore colour palettes, applied live.
 *
 * Runs on the game page only (main thread). The game's Web Workers (world generation, meshing) are NOT touched,
 * so the world is generated exactly as in the stock game - which keeps co-op identical for every player.
 *
 * What changes, per ore: the surface texture (the game's KTX2 atlas, recoloured), the glow, the dig trail and
 * the colour table used for debris and scanner points. Patches in mod.json hand this file references to the
 * game's live objects, so a palette switch updates them in place without a restart.
 *
 * Palettes were checked with a colour-vision simulation (Machado 2009, full severity); see README.md.
 */
(function (g) {
  "use strict";
  if (g.__naA11y) return;

  var PALETTES = {
    "default": { name: "Game default", ores: {} },
    "colorblind": {
      name: "Colorblind-safe",
      note: "Best for every type of colour blindness (protan, deutan, tritan).",
      ores: {
        ice:        { glow: "#d8ecff" },
        neutronium: { glow: "#0050ff" },
        crystal:    { glow: "#b05fc0" },
        darkMatter: { glow: "#00c080" },
        plasmite:   { glow: "#c84000" },
        antimatter: { glow: "#e8d020" }
      }
    },
    "okabe-ito": {
      name: "Okabe-Ito",
      note: "The standard colour-blind-friendly set used in science figures.",
      ores: {
        ice:        { glow: "#f2f8ff" },
        neutronium: { glow: "#0072b2" },
        crystal:    { glow: "#cc79a7" },
        darkMatter: { glow: "#009e73" },
        plasmite:   { glow: "#e69f00" },
        antimatter: { glow: "#f0e442" }
      }
    }
  };

  function readSettings() {
    try {
      var x = new XMLHttpRequest();
      x.open("GET", "/__mods/accessibility/settings.json", false);
      x.send();
      if (x.status === 200) return JSON.parse(x.responseText) || {};
    } catch (e) {}
    return {};
  }
  function oresFor(s) {
    var choice = typeof s.palette === "string" ? s.palette : "default";
    return choice === "custom" ? (s.custom || {}) : ((PALETTES[choice] || PALETTES["default"]).ores);
  }

  var settings = readSettings();
  var state = {
    choice: typeof settings.palette === "string" ? settings.palette : "default",
    ores: oresFor(settings),
    textures: settings.textures !== false
  };

  // ---- colour helpers
  function hex(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || ""));
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var luma = function (c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  var lin = function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  function toHsl(r, gg, b) {
    r /= 255; gg /= 255; b /= 255;
    var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, h = 0, d = mx - mn;
    if (d) { h = mx === r ? (gg - b) / d + (gg < b ? 6 : 0) : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4; h /= 6; }
    return [h, 0, l];
  }
  function hue2(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  }

  // ---- the game's original colours, recorded from the patch fallbacks as the game loads
  var ORIG = {};
  function orig(ore, kind, v) {
    var o = ORIG[ore] || (ORIG[ore] = {});
    if (!(kind in o)) o[kind] = v;
    return o[kind];
  }

  /** a glow or trail colour for an ore; trails follow the glow unless set */
  function colourFor(ore, kind) {
    var o = state.ores[ore], fb = (ORIG[ore] || {})[kind];
    if (!o) return fb;
    var v = kind === "trail" ? (o.trail || o.glow) : o.glow;
    return hex(v) ? v : fb;
  }
  /** the base colour: the palette's hue at the original's brightness, so dark ores stay dark */
  function rgbFor(ore) {
    var fb = (ORIG[ore] || {}).rgb, o = state.ores[ore];
    if (!o || !fb) return fb;
    var c = hex(o.rgb) || hex(o.glow);
    if (!c) return fb;
    if (o.rgb) return c;
    var k = luma(fb) / (luma(c) || 1);
    return [0, 1, 2].map(function (i) { return Math.max(0, Math.min(255, Math.round(c[i] * k))); });
  }

  // ---- texture recolouring: each pixel keeps its lightness (the texture's detail) and takes the palette colour's
  // hue and chroma. (Chroma, not HSL saturation: pale #d8ecff is "100% saturated" in HSL and would turn vivid blue.)
  function recolor(name, px) {
    var o = state.ores[name];
    var c = o && (hex(o.tex) || hex(o.glow));
    if (!c || !px || !px.length) return false;
    var H = toHsl(c[0], c[1], c[2])[0], L = toHsl(c[0], c[1], c[2])[2];
    var chroma = (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])) / 255;
    var mix = typeof o.texMix === "number" ? o.texMix : 0.9;
    var sum = 0, n = 0;
    for (var i = 0; i < px.length; i += 16) { sum += toHsl(px[i], px[i + 1], px[i + 2])[2]; n++; }
    var shift = (L - sum / n) * 0.5;
    for (var k = 0; k < px.length; k += 4) {
      var l = Math.max(0, Math.min(1, toHsl(px[k], px[k + 1], px[k + 2])[2] + shift));
      var room = 1 - Math.abs(2 * l - 1), S = room > 0.001 ? Math.min(1, chroma / room) : 0;
      var q = l < 0.5 ? l * (1 + S) : l + S - l * S, p = 2 * l - q;
      px[k]     = Math.round(px[k]     * (1 - mix) + hue2(p, q, H + 1 / 3) * 255 * mix);
      px[k + 1] = Math.round(px[k + 1] * (1 - mix) + hue2(p, q, H) * 255 * mix);
      px[k + 2] = Math.round(px[k + 2] * (1 - mix) + hue2(p, q, H - 1 / 3) * 255 * mix);
    }
    return true;
  }

  // ---- live references into the game, handed over by the patches
  var live = { mats: [], trails: [], table: null, surfs: [], atlas: null };

  // ---- the surface atlas. The game ships it compressed for the GPU (KTX2/UASTC), so it can't be edited in place.
  // We decode it once with the game's own Basis transcoder, keep the original ore layers, and build an uncompressed
  // copy we can recolour any time. The game's original texture is kept, so "Game default" just switches back to it.
  var basisP = null;
  function basis() {
    if (!basisP) {
      basisP = Promise.all([
        fetch("/basis/basis_transcoder.js").then(function (r) { if (!r.ok) throw new Error("transcoder " + r.status); return r.text(); }),
        fetch("/basis/basis_transcoder.wasm").then(function (r) { if (!r.ok) throw new Error("wasm " + r.status); return r.arrayBuffer(); })
      ]).then(function (a) {
        return (new Function(a[0] + "\n;return BASIS;")())({ wasmBinary: a[1] });
      }).then(function (M) { M.initializeBasis(); return M; });
    }
    return basisP;
  }
  async function buildRgba(A) {
    var t0 = Date.now();
    var M = await basis();
    var buf = new Uint8Array(await fetch(A.url).then(function (r) { if (!r.ok) throw new Error("atlas " + r.status); return r.arrayBuffer(); }));
    var k = new M.KTX2File(buf), w, h, L, data, size;
    A.base = {};
    try {
      if (!k.isValid() || !k.startTranscoding()) throw new Error("atlas is not a valid KTX2");
      w = k.getWidth(); h = k.getHeight(); L = Math.max(1, k.getLayers());
      if (L !== A.names.length) throw new Error("atlas has " + L + " layers, game expects " + A.names.length);
      size = w * h * 4;
      data = new Uint8Array(size * L);
      for (var layer = 0; layer < L; layer++) {
        var dst = new Uint8Array(k.getImageTranscodedSizeInBytes(0, layer, 0, 13));   // 13 = RGBA32
        if (dst.length !== size || !k.transcodeImage(dst, 0, layer, 0, 13, 0, -1, -1)) throw new Error("could not decode layer " + layer);
        data.set(dst, layer * size);
        if (ORE_LAYERS.indexOf(A.names[layer]) >= 0) A.base[layer] = dst;   // the original, to recolour from
      }
    } finally { k.close(); k.delete(); }
    var out = new A.sample.constructor(data, w, h, L);   // THREE.DataArrayTexture, like the game's other arrays
    out.format = 1023; out.type = 1009;                  // RGBAFormat, UnsignedByteType
    out.colorSpace = A.orig.colorSpace;
    out.wrapS = A.orig.wrapS; out.wrapT = A.orig.wrapT; out.anisotropy = A.orig.anisotropy;
    out.minFilter = 1008; out.magFilter = 1006;          // LinearMipmapLinear, Linear
    out.generateMipmaps = true; out.flipY = false;
    A.rgba = out; A.size = size;
    A.decodeMs = Date.now() - t0;
  }
  function recolorRgba(A) {
    var data = A.rgba.image.data, done = [];
    for (var layer in A.base) {
      var px = A.base[layer].slice();
      if (recolor(A.names[layer], px)) done.push(A.names[layer]);
      data.set(px, layer * A.size);
    }
    A.rgba.needsUpdate = true;
    return done;
  }
  var ORE_LAYERS = ["ice", "iron", "gold", "crystal", "plasmite", "neutronium", "darkMatter", "antimatter", "nickel", "titanium"];
  function wantsTextures() {
    return state.textures && ORE_LAYERS.some(function (n) { var o = state.ores[n]; return o && (o.tex || o.glow); });
  }
  async function applyAtlas() {
    var A = live.atlas;
    if (!A) return null;
    var use = A.orig;
    if (wantsTextures()) {
      if (!A.rgba) await buildRgba(A);
      A.recoloured = recolorRgba(A);
      use = A.rgba;
    } else if (A.rgba) {
      // Free the video memory but keep the decoded pixels (~100 MB of RAM), so switching back takes ~0.4 s
      // instead of decoding the atlas again (~3 s, which would freeze the game). three.js re-uploads on next use.
      var old = A.rgba;
      setTimeout(function () { if (A.current !== old) old.dispose(); }, 1000);   // after the switch has rendered
    }
    live.surfs.forEach(function (u) { u.value = use; });
    A.current = use;
    return use;
  }

  // ---- push the current palette into every live object
  function applyColours() {
    var n = 0;
    live.mats.forEach(function (m) {
      for (var ore in ORIG) {
        var idx = m.ids[ore];
        if (idx == null) continue;
        var entry = m.table[idx];
        if (entry && entry.glow && ORIG[ore].glow) {
          entry.glow[0] = colourFor(ore, "glow");   // for materials the game creates later
          var c = hex(colourFor(ore, "glow")), v = m.c[idx];
          if (c && v && v.set) { v.set(lin(c[0]) * entry.glow[1], lin(c[1]) * entry.glow[1], lin(c[2]) * entry.glow[1], v.w); n++; }
        }
        if (entry && ORIG[ore].trail) entry.trail = colourFor(ore, "trail");
      }
    });
    live.trails.forEach(function (t) {
      for (var ore in ORIG) {
        var idx = t.ids && t.ids[ore];
        if (idx != null && t.arr[idx] && t.arr[idx].set && ORIG[ore].trail) { t.arr[idx].set(colourFor(ore, "trail")); n++; }
      }
    });
    var T = live.table;
    if (T && T.ids) {
      for (var ore2 in ORIG) {
        var i = T.ids[ore2], rgb = rgbFor(ore2);
        if (i == null || !rgb || !T.p[i]) continue;
        T.p[i].rgb = rgb;
        if (T.m) T.m.set(rgb, i * 3);
        if (T.g) for (var j = 0; j < 3; j++) T.g[i * 3 + j] = Math.pow(rgb[j] / 255, 2.2);
        n++;
      }
    }
    return n;
  }

  var ids = null;   // ore name -> material index, from the game's material enum

  var api = g.__naA11y = {
    palettes: PALETTES,
    get choice() { return state.choice; },
    get tex() { return wantsTextures(); },
    get ores() { return state.ores; },
    atlasInfo: null,

    // -- called by patches while the game loads; each returns what the game expects
    c: function (ore, kind, fallback) { orig(ore, kind, fallback); return colourFor(ore, kind); },
    rgb: function (ore, fallback) { orig(ore, "rgb", fallback); return rgbFor(ore); },
    mats: function (arrays, table, enumObj) {
      ids = ids || enumObj;
      live.mats.push({ c: arrays.c, table: table, ids: enumObj });
      return arrays;
    },
    trails: function (arr) { live.trails.push({ arr: arr, get ids() { return ids; } }); return arr; },
    table: function (p, m, gArr) { live.table = { p: p, m: m, g: gArr, get ids() { return ids; } }; },
    surf: function (u) { live.surfs.push(u); if (live.atlas && live.atlas.current) u.value = live.atlas.current; return u; },
    atlas: function (tex, sample, layers, url) {
      if (!tex || !sample || !layers || !url) return Promise.resolve(tex);
      var names = [];
      layers.forEach(function (index, name) { names[index] = name; });
      live.atlas = { orig: tex, sample: sample, names: names, url: url, rgba: null, base: null, current: tex };
      return applyAtlas().then(function (t) {
        api.atlasInfo = { ms: live.atlas.decodeMs || 0, layers: names.length, names: names, url: url, recoloured: live.atlas.recoloured || [] };
        return t || tex;
      }).catch(function (e) {
        api.atlasInfo = { error: String(e) };
        live.atlas.current = tex;
        if (typeof console !== "undefined") console.warn("[a11y] ore textures left as they were:", e);
        return tex;
      });
    },

    /** switch palette / texture recolouring while the game runs; resolves when everything is updated */
    apply: function (s) {
      state.choice = typeof s.palette === "string" ? s.palette : "default";
      state.ores = oresFor(s);
      state.textures = s.textures !== false;
      var n = applyColours();
      var t0 = Date.now();
      return applyAtlas().then(function () {
        api.lastApply = { colours: n, ms: Date.now() - t0, textures: wantsTextures(), recoloured: live.atlas && live.atlas.recoloured || [] };
        return api.lastApply;
      }).catch(function (e) {
        live.surfs.forEach(function (u) { u.value = live.atlas.orig; });
        api.lastApply = { colours: n, error: String(e) };
        return api.lastApply;
      });
    },
    /** whether the live hooks are in place (for the panel) */
    hooks: function () {
      return { materials: live.mats.length, trails: live.trails.length, table: !!live.table, surfaces: live.surfs.length, atlas: !!live.atlas };
    },
    /** read-only look at the live references (for tests and modders) */
    debug: function () { return { live: live, ids: ids, orig: ORIG }; },
    /** recolours RGBA pixels in place with the current palette (used by tests) */
    recolor: function (name, px) { try { return recolor(name, px); } catch (e) { return false; } }
  };
})(typeof self !== "undefined" ? self : window);
