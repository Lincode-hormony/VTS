import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const workerSrc = path.join(root, "pages-worker.mjs");
const workerDest = path.join(distDir, "_worker.js");
const assetsIgnore = path.join(distDir, ".assetsignore");

await fs.mkdir(distDir, { recursive: true });
await fs.copyFile(workerSrc, workerDest);
await fs.writeFile(assetsIgnore, "_worker.js\n", "utf8");
