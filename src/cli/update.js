import { spawnSync } from "child_process"
import { recordCommand } from "../core/recorder.js"

const VALUE_OPTIONS = new Set([
  "--before", "--cache", "--prefix", "--registry", "--tag", "--userconfig",
  "--workspace", "-w", "--loglevel", "--omit", "--include", "--install-strategy",
])

// Returns true if update targets a specific package, ignoring option values.
export function hasPackage(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--") return i + 1 < args.length
    if (VALUE_OPTIONS.has(arg)) {
      i++
    } else if (!arg.startsWith("-")) {
      return true
    }
  }
  return false
}

export function runUpdate(args = []) {
  const result = spawnSync("npm", ["update", ...args], {
    stdio: "inherit"
  })

  // Exit if update fails
  if (result.status !== 0) {
    process.exit(result.status)
  }

  recordCommand({ command: "update", args })
}
