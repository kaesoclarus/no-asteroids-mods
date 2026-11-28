/* ---- No Asteroids mod loader (main process) ---- injected by Install-ModLoader.ps1 */
var __naMods = (() => {
  const fs = require("node:fs"), path = require("node:path");
  const root = path.join(path.dirname(process.execPath), "mods");
  const out = { version: "1.1.1", root, devtools: false, mods: [], overrides: new Map(), patches: [], report: [], errors: [] };
  const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").trim()); // trim() also drops a BOM (Notepad, PowerShell)
  const inside = (base, rel) => {
    const r = path.resolve(base, rel);
    return r.startsWith(base + path.sep) ? r : null;
  };
  const glob = (g) => new RegExp("^" + g.toLowerCase().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + "$");
  const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json" };

  try {
    try { out.devtools = readJson(path.join(root, "loader.json")).devtools === true; } catch {}
    const ids = fs.existsSync(root)
      ? fs.readdirSync(root, { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(d.name))
          .map((d) => d.name).sort()
      : [];
    for (const id of ids) {
      const dir = path.join(root, id);
      if (!fs.existsSync(path.join(dir, "mod.json"))) continue;
      let m;
      try { m = readJson(path.join(dir, "mod.json")); }
      catch (e) { out.errors.push(`${id}/mod.json: ${e.message}`); continue; }
      if (m.enabled === false) continue;
      const list = (v) => (Array.isArray(v) ? v : []).filter((s) => typeof s === "string" && inside(dir, s));
      const mod = {
        id, name: String(m.name ?? id), version: String(m.version ?? ""), author: String(m.author ?? ""),
        description: String(m.description ?? ""),
        scripts: list(m.scripts).map((s) => `/__mods/${id}/${s.replace(/\\/g, "/")}`),
        styles: list(m.styles).map((s) => `/__mods/${id}/${s.replace(/\\/g, "/")}`),
        config: m.config && typeof m.config === "object" ? m.config : {},
        overrides: 0, patches: 0
      };
      out.mods.push(mod);
      // mods/<id>/files/ mirrors the game's web folder: files/audio/music-hunt.ogg replaces /audio/music-hunt.ogg
      const files = path.join(dir, "files");
      const walk = (d, rel) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const r = `${rel}/${e.name}`;
          if (e.isDirectory()) walk(path.join(d, e.name), r);
          else { out.overrides.set(r.toLowerCase(), path.join(d, e.name)); mod.overrides++; }
        }
      };
      if (fs.existsSync(files)) walk(files, "");
      // text patches: [{ file: "/assets/index-*.js", find, replace, regex?, flags?, expect?, prepend? }]
      for (const [i, p] of (Array.isArray(m.patches) ? m.patches : []).entries()) {
        const globs = typeof p?.file === "string" ? [p.file] : Array.isArray(p?.file) ? p.file.filter((f) => typeof f === "string") : [];
        if (!globs.length) { out.errors.push(`${id}: patch ${i} has no "file"`); continue; }
        let prepend = null;
        if (typeof p.prepend === "string") {
          const f = inside(dir, p.prepend);
          try { prepend = f && fs.readFileSync(f, "utf8"); } catch (e) { out.errors.push(`${id}: patch ${i}: ${e.message}`); continue; }
        }
        let re = null;
        if (p.regex && typeof p.find === "string") {
          try { re = new RegExp(p.find, typeof p.flags === "string" ? p.flags : "g"); }
          catch (e) { out.errors.push(`${id}: patch ${p.id ?? i}: bad regex: ${e.message}`); continue; }
        }
        const res = globs.map(glob);
        out.patches.push({ mod: id, id: String(p.id ?? i), match: { test: (s) => res.some((r) => r.test(s)) }, find: typeof p.find === "string" ? p.find : null,
          re, replace: typeof p.replace === "string" ? p.replace : "", expect: Number.isInteger(p.expect) ? p.expect : null, prepend });
        mod.patches++;
      }
    }
  } catch (e) { out.errors.push(String(e)); }

  /** a file on disk that serves this app:// path instead of the packed one, or null */
  out.resolve = (pathname) => {
    let p;
    try { p = path.posix.normalize(decodeURIComponent(pathname)); } catch { return null; }
    if (p.startsWith("/__mods/")) {
      const [, , id, ...rest] = p.split("/");
      if (!out.mods.some((m) => m.id === id)) return null;
      return inside(path.join(root, id), rest.join("/"));
    }
    return out.overrides.get(p.toLowerCase()) ?? null;
  };

  const patched = new Map();
  const applyPatches = (p, text) => {
    const mine = out.patches.filter((x) => x.match.test(p.toLowerCase()));
    if (!mine.length) return null;
    let prefix = "";
    for (const x of mine) {
      const rec = { mod: x.mod, id: x.id, file: p, hits: 0, applied: false, note: "" };
      out.report.push(rec);
      if (x.prepend != null) { prefix += x.prepend + "\n;"; rec.hits = 1; rec.applied = true; }
      if (x.find == null) continue;
      let hits;
      if (x.re) { x.re.lastIndex = 0; hits = (text.match(new RegExp(x.re.source, x.re.flags.includes("g") ? x.re.flags : x.re.flags + "g")) || []).length; }
      else hits = text.split(x.find).length - 1;
      rec.hits = hits;
      if (!hits) { rec.note = "no match (game updated?)"; continue; }
      if (x.expect != null && hits !== x.expect) { rec.note = `expected ${x.expect} match(es), found ${hits}; skipped`; continue; }
      text = x.re ? text.replace(x.re, x.replace) : text.split(x.find).join(x.replace);
      rec.applied = true;
    }
    // the trailing comment changes the length, so V8 won't reuse code cached from the unpatched file
    return prefix + text + `\n//# namods: ${mine.map((x) => x.mod + "/" + x.id).join(",").slice(0, 200)}\n`;
  };

  /** handles mod requests for the app:// protocol; null lets the game serve the request as usual */
  out.handle = async (req, pathname, webPath, net, pathToFileURL) => {
    let p;
    try { p = path.posix.normalize(decodeURIComponent(pathname)); } catch { return null; }
    if (!out.mods.length && !out.errors.length) return null;
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
    if (p === "/__mods.json") return json({ loader: out.version, devtools: out.devtools, errors: out.errors, mods: out.mods });
    if (p === "/__mods/patches.json") return json(out.report);
    // developer mode only: save a screenshot of the game window to mods/_screenshots/<name>.png
    const shot = /^\/__mods\/dev\/shot\/([A-Za-z0-9_-]{1,60})$/.exec(p);
    if (shot) {
      if (!out.devtools) return json({ error: "developer mode is off (loader.json devtools)" }, 403);
      try {
        const { webContents } = require("electron");
        const page = webContents.getAllWebContents().find((w) => !w.isDestroyed() && w.getURL().startsWith("app://game"));
        if (!page) return json({ error: "no game page" }, 404);
        const img = await page.capturePage();
        const dir = path.join(root, "_screenshots");
        await fs.promises.mkdir(dir, { recursive: true });
        const file = path.join(dir, shot[1] + ".png");
        await fs.promises.writeFile(file, img.toPNG());
        return json({ ok: true, file, size: img.getSize() });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    const s = /^\/__mods\/([^/]+)\/settings\.json$/.exec(p);
    if (s) {
      if (!out.mods.some((m) => m.id === s[1])) return json({ error: "no such mod" }, 404);
      const file = path.join(root, s[1], "settings.json");
      if (req.method === "PUT" || req.method === "POST") {
        try {
          const body = await req.text();
          if (body.length > 256 * 1024) return json({ error: "too big" }, 413);
          const v = JSON.parse(body);
          await fs.promises.writeFile(file, JSON.stringify(v, null, 2));
          return json({ ok: true });
        } catch (e) { return json({ error: String(e) }, 400); }
      }
      try { return new Response(await fs.promises.readFile(file, "utf8"), { headers: { "content-type": "application/json" } }); }
      catch { return json({}); }
    }
    const disk = out.resolve(pathname);
    if (out.patches.length && !p.startsWith("/__mods/")) {
      if (!patched.has(p) && out.patches.some((x) => x.match.test(p.toLowerCase()))) {
        const file = disk ?? webPath(pathname);
        // the promise is cached at once, so workers that start together share one patching pass
        if (file) patched.set(p, fs.promises.readFile(file, "utf8").then((t) => applyPatches(p, t))
          .catch((e) => { out.errors.push(`patching ${p}: ${e}`); return null; }));
      }
      if (patched.has(p)) {
        const text = await patched.get(p);
        if (text != null) return new Response(text, { headers: { "content-type": MIME[path.extname(p)] ?? "text/plain" } });
      }
    }
    if (disk) {
      try { return await net.fetch(pathToFileURL(disk).toString()); }
      catch { return new Response(null, { status: 404 }); }
    }
    return null;
  };

  if (out.mods.length || out.errors.length) {
    console.log(`[mods] ${out.mods.length} mod(s) from ${root}: ${out.mods.map((m) => m.id).join(", ")}`);
    for (const e of out.errors) console.warn(`[mods] ${e}`);
  }
  return out;
})();
/* ---- end mod loader ---- */
