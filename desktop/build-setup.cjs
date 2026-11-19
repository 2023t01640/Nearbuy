const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function run(args, cwd = root) {
  const r = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) throw Error("Build step failed: " + args.join(" "));
}
async function main() {
  run(["node_modules/vite/bin/vite.js", "build"], path.join(root, "frontend"));
  const sharp = require("../backend/node_modules/sharp");
  fs.mkdirSync(path.join(__dirname, "assets"), { recursive: true });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="56" fill="#23614d"/><path d="M128 38c-41 0-71 30-71 69 0 51 71 111 71 111s71-60 71-111c0-39-30-69-71-69Z" fill="none" stroke="white" stroke-width="13"/><circle cx="128" cy="107" r="23" fill="none" stroke="white" stroke-width="12"/></svg>';
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  const icon = Buffer.concat([header, png]);
  fs.writeFileSync(path.join(__dirname, "assets/nearbuy.ico"), icon);
  const stage = path.join(__dirname, "stage/backend");
  const stagingRoot = path.resolve(__dirname, "stage");
  if (path.resolve(stage) !== path.join(stagingRoot, "backend")) {
    throw new Error("Unexpected installer staging path");
  }
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const name of ["src", "assets", "package.json"])
    fs.cpSync(path.join(root, "backend", name), path.join(stage, name), {
      recursive: true,
      dereference: true,
    });
  fs.writeFileSync(path.join(stage, "assets/nearbuy.ico"), icon);
  // Materialize pnpm links so the installed runtime is self-contained.
  fs.cpSync(
    path.join(root, "backend/node_modules"),
    path.join(stage, "node_modules"),
    { recursive: true, dereference: true },
  );
  const transitive=path.join(root,'backend/node_modules/.pnpm/node_modules');
  for(const name of fs.readdirSync(transitive)){if(name.startsWith('.'))continue;fs.cpSync(path.join(transitive,name),path.join(stage,'node_modules',name),{recursive:true,dereference:true});}
  run([
    require.resolve("electron-builder/out/cli/cli.js"),
    "--win",
    "nsis",
    "--x64",
  ]);
  console.log("Installer: " + path.join(root, "release/NearBuy-Setup.exe"));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
