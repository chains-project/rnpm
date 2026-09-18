import fs from "fs"
import os from "os"
import { execSync } from "child_process"
import { sha256File } from "../utils/hash.js"

function readLock() {
  return JSON.parse(fs.readFileSync("package-lock.json", "utf8"))
}

function writeLock(lock) {
  // Atomic write
  const tmp = "package-lock.json.tmp"

  fs.writeFileSync(tmp, JSON.stringify(lock, null, 2) + "\n")
  fs.renameSync(tmp, "package-lock.json")
}

function buildRecord({ command, args }) {
  return {
    command,
    args,
    npm: execSync("npm -v").toString().trim(),
    time: new Date().toISOString(),
  }
}

export function recordCommand({ command, args }) {
  const lock = readLock()

  lock.rnpm ??= {}
  lock.rnpm.history ??= []

  lock.rnpm.history.push(buildRecord({ command, args }))

  // Update manifest hash
  lock.manifestIntegrity = sha256File("package.json")

  writeLock(lock)
}

