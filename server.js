const express = require("express");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = 3457;
const isWin = os.platform() === "win32";

app.use(express.static("public"));

// ─── Load apps ─────────────────────────────────────────────────
function getApps() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "apps.json"), "utf-8"));
}

// ─── API: List apps ────────────────────────────────────────────
app.get("/api/apps", (req, res) => res.json({ apps: getApps() }));

// ─── API: Launch ───────────────────────────────────────────────
app.post("/api/launch", (req, res) => {
  const appId = req.query.id;
  if (!appId) return res.status(400).json({ error: "Se requiere id" });
  const target = getApps().find(a => a.id === appId);
  if (!target) return res.status(404).json({ error: "App no encontrada" });

  try {
    if (target.type === "app" || target.isProtocol) {
      // App / protocol (Steam:// etc.)
      if (isWin) {
        exec(`start "" "${target.url}"`);
      } else {
        exec(`xdg-open "${target.url}"`);
      }
      return res.json({ success: true, message: `Abriendo ${target.name}` });
    }

    // URL → open in browser
    if (isWin) {
      exec(`start msedge "${target.url}"`);
    } else {
      const browsers = [
        "/usr/bin/chromium-browser", "/usr/bin/brave-browser",
        "/usr/bin/google-chrome", "/usr/bin/chromium",
      ];
      const browser = browsers.find(fs.existsSync.bind(fs)) || "xdg-open";
      if (browser === "xdg-open") {
        exec(`xdg-open "${target.url}"`);
      } else {
        spawn(browser, ["--kiosk", `--app=${target.url}`], {
          env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
          detached: true, stdio: "ignore",
        }).unref();
      }
    }
    res.json({ success: true, message: `Abriendo ${target.name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ─────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎮 TV Launcher`);
  console.log(`   Local:   http://localhost:${PORT}`);
  if (!isWin) console.log(`   Network: http://${require("os").hostname()}:${PORT}`);
});
