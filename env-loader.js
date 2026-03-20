// Pre-load .env before any ES module imports
// This runs via --import flag to ensure env vars are set before server.js
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
  console.log("[env] Loaded .env:", Object.keys(process.env).filter(k => k.includes("API_KEY") || k === "PORT").map(k => `${k}=${k.includes("API_KEY") ? "***" + (process.env[k]?.slice(-6) || "") : process.env[k]}`).join(", "));
} catch (e) {
  console.warn("[env] No .env file found");
}
