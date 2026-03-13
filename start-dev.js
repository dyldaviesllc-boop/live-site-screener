import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Start Express server
const server = spawn("node", [join(__dirname, "server.js")], {
  cwd: __dirname,
  stdio: "inherit",
});

// Start Vite dev server (cwd sets root, no --root flag in vite v7)
const vite = spawn("node", [
  join(__dirname, "node_modules/vite/bin/vite.js"),
  "--port", "3785",
], {
  cwd: __dirname,
  stdio: "inherit",
});

process.on("SIGTERM", () => { server.kill(); vite.kill(); });
process.on("SIGINT", () => { server.kill(); vite.kill(); });
