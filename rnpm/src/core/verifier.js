import fs from "fs"
import path from "path"
import { execFileSync, spawnSync } from "child_process"
import { compareLockfiles } from "./compareLockfiles.js"
import { hasPackage } from "../cli/update.js"

const BACKUP_DIR = ".backup"
const LOCKFILE_NAME = "package-lock.json"
const PROOF_NAME = "rnpm-replication.json"
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm"

export async function generateProof(tmp, replay = { setRecordedEnvironment, runNpm }) {
  const root = process.cwd()
  const proofPath = path.join(tmp, PROOF_NAME)
  const rootLockfilePath = path.join(root, LOCKFILE_NAME)
  const manifestPath = path.join(root, "package.json")

  const lock = JSON.parse(
    fs.readFileSync(rootLockfilePath, "utf8")
  )

  const history = lock.rnpm.history

  const cachePath = path.join(tmp, ".npm-cache")
  const retainManifest = history.length === 1 &&
    history[0].command === "update" && !hasPackage(history[0].args ?? [])
  const originalManifest = retainManifest ? null : fs.readFileSync(manifestPath)

  // Rebuild in the original project directory so workspace package manifests
  // and other local path relationships remain available to npm during replay.
  fs.rmSync(rootLockfilePath, { force: true })
  try {
    if (!retainManifest) fs.rmSync(manifestPath, { force: true })

    for (const entry of history) {
      replay.setRecordedEnvironment(entry)

      console.error(
        `Replaying npm ${entry.command} with npm@${entry.npm}...`
      )
      replay.runNpm(buildReplayArgs(entry, cachePath), root)
    }

    fs.copyFileSync(rootLockfilePath, proofPath)
  } finally {
    if (!retainManifest) fs.writeFileSync(manifestPath, originalManifest)
  }
}

export function compareProof(
  originalPath = LOCKFILE_NAME,
  proofPath = PROOF_NAME
) {
  const result = compareLockfiles(originalPath, proofPath)

  if (!result.ok) {
    throw new Error(result.message)
  }
}

export function buildReplayArgs(entry, cachePath = null) {
  const args = [
    entry.command,
    ...(entry.args ?? [])
  ]

  if (usesBefore(entry.command)) {
    args.push("--before", entry.time)
  }

  args.push(
    "--package-lock-only",
    "--no-fund",
    "--no-progress",
    "--no-audit",
    "--ignore-scripts"
  )

  if (cachePath) {
    args.push("--cache", cachePath)
  }

  return args
}

function usesBefore(command) {
  return command === "install" || command === "update"
}

function runNpm(args, cwd, stdio = ["ignore", "ignore", "inherit"]) {
  const result = spawnSync(NPM_BIN, args, { cwd, stdio })

  if (result.error) {
    throw new Error(`npm ${args[0]} failed: ${result.error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(`npm ${args[0]} failed`)
  }
}

function setRecordedEnvironment(entry) {
  ensureNpmVersion(entry.npm)

  // OS cannot realistically be changed here.
  // Best effort: verify and warn.
  const currentOs = getCurrentOs()

  if (entry.os && currentOs !== entry.os) {
    console.warn(
      `Warning: recorded os=${entry.os}, current os=${currentOs}`
    )
  }
}

function ensureNpmVersion(version) {
  const current = execFileSync(NPM_BIN, ["-v"], { encoding: "utf8" }).trim()

  if (current === version) return

  console.error(`Switching npm from ${current} to ${version}...`)
  const result = spawnSync(
    NPM_BIN,
    ["install", "-g", `npm@${version}`, "--loglevel", "notice"],
    { stdio: "inherit" }
  )

  if (result.error) {
    throw new Error(`failed to switch npm version: ${result.error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(`failed to switch npm version to ${version}`)
  }
}

function getCurrentOs() {
  try {
    return fs.readFileSync("/proc/sys/kernel/osrelease", "utf8").trim()
  } catch {
    return process.platform
  }
}

export function backupLockfile(
  root = process.cwd(),
  backupRoot = path.join(root, BACKUP_DIR)
) {
  const state = createBackupState(root, backupRoot)

  fs.mkdirSync(state.dir, { recursive: true })
  fs.copyFileSync(state.lockfilePath, state.backupPath)

  return state
}

export function restoreBackupIfNeeded(
  root = process.cwd(),
  backupRoot = path.join(root, BACKUP_DIR)
) {
  const state = createBackupState(root, backupRoot)

  if (!fs.existsSync(state.backupPath)) {
    return false
  }

  if (!fs.existsSync(state.lockfilePath) || !filesEqual(state.lockfilePath, state.backupPath)) {
    fs.mkdirSync(path.dirname(state.lockfilePath), { recursive: true })
    fs.copyFileSync(state.backupPath, state.lockfilePath)
    return true
  }

  return false
}

export function removeBackup(root = process.cwd(), backupRoot = path.join(root, BACKUP_DIR)) {
  const state = createBackupState(root, backupRoot)

  if (fs.existsSync(state.dir)) {
    fs.rmSync(state.dir, { recursive: true, force: true })
  }
}

function createBackupState(root, backupRoot) {
  return {
    dir: backupRoot,
    lockfilePath: path.join(root, LOCKFILE_NAME),
    backupPath: path.join(backupRoot, LOCKFILE_NAME),
  }
}

function filesEqual(pathA, pathB) {
  return fs.readFileSync(pathA).equals(fs.readFileSync(pathB))
}

export const __testing__ = {
  createBackupState,
  filesEqual,
}
