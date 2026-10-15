import { spawnSync } from "child_process"
import { recordCommand } from "../core/recorder.js"

export function runUninstall(args) {
  const res = spawnSync("npm", ["uninstall", ...args], { stdio: "inherit" })
  if (res.status !== 0) process.exit(res.status)

  recordCommand({ command: "uninstall", args })
}
