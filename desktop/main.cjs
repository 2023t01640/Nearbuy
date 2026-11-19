const { app, shell, dialog, Tray, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
let child, tray;
const url = "http://127.0.0.1:5175";
async function ready() {
  try {
    const r = await fetch(url + "/api/v1/health", {
      signal: AbortSignal.timeout(1000),
    });
    return r.ok && (await r.json()).status === "ok";
  } catch {
    return false;
  }
}
async function launch() {
  if (await ready()) {
    await shell.openExternal(url);
    return;
  }
  const home = app.getPath("userData");
  fs.mkdirSync(home, { recursive: true });
  const backend = path.join(process.resourcesPath, "backend");
  const log = fs.openSync(path.join(home, "launcher.log"), "a");
  child = spawn(process.execPath, [path.join(backend, "src/server.js")], {
    cwd: home,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "development",
      PORT: "5175",
      DATA_DIR: path.join(home, "data"),
      UPLOAD_DIR: path.join(home, "uploads"),
      FRONTEND_DIST: path.join(process.resourcesPath, "frontend"),
      DEMO_MODE: "true",
    },
  });
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  for (let i = 0; i < 120; i++) {
    if (await ready()) {
      await shell.openExternal(url);
      return;
    }
    if (exited) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error(
    "NearBuy could not start. See " +
      path.join(home, "launcher.log") +
      ". Port 5175 may already be occupied.",
  );
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => shell.openExternal(url));
  app.whenReady().then(async () => {
    tray = new Tray(
      path.join(process.resourcesPath, "backend/assets/nearbuy.ico"),
    );
    tray.setToolTip("NearBuy");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open NearBuy", click: () => shell.openExternal(url) },
        { label: "Quit NearBuy", click: () => app.quit() },
      ]),
    );
    try {
      await launch();
    } catch (e) {
      dialog.showErrorBox("NearBuy", e.message);
      app.quit();
    }
  });
  app.on("before-quit", () => child?.kill());
}
