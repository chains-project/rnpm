import { spawnSync } from "child_process"
import { recordCommand } from "../core/recorder.js"

export function runInstall(args) {
  const res = spawnSync("npm", ["install", ...args], { stdio: "inherit" })
  if (res.status !== 0) process.exit(res.status)

  recordCommand({ command: "install", args })
}
