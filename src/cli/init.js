import { spawnSync } from "child_process"
import { runUpdate } from "./update.js"

export function runInit(args) {
  spawnSync("npm", ["init", ...args], { stdio: "inherit" })

  // Since a project can only be an rnpm project if a lockfile exists,
  // we run update after init to convert it
  runUpdate()

  console.log("Initialized rnpm project")
}