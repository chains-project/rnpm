import fs from "fs"
import path from "path"
import os from "os"
import { execSync } from "child_process"
import {
  backupLockfile,
  compareProof,
  generateProof,
  removeBackup,
  restoreBackupIfNeeded,
} from "../core/verifier.js"
import { promptYesNo } from "../utils/prompt.js"

const defaultVerifyDeps = {
  backupLockfile,
  compareProof,
  execSync,
  existsSync: fs.existsSync,
  generateProof,
  mkdtempSync: fs.mkdtempSync,
  moveFileSync,
  promptYesNo,
  removeBackup,
  restoreBackupIfNeeded,
  restoreEnvironment,
  rmSync: fs.rmSync,
}

/**
 * Verifies that the current lockfile can be deterministically reproduced.
 *
 * The process:
 * - Optionally reuses an existing replication proof
 * - Replays recorded install history in a temporary environment using npm --before
 * - Generates a replicated lockfile
 * - Compares the replicated lockfile with the original
 *
 * Side effects:
 * - Temporarily modifies Node and npm versions
 * - Creates and deletes a temporary working directory
 *
 * @param {string[]} args - CLI arguments (supports --regen to force regeneration)
 */
export async function runVerify(args = []) {
  return runVerifyWith(args, defaultVerifyDeps)
}

async function runVerifyWith(args = [], deps) {
  // Allow flag to skip regeneration prompt
  const forceRegen = args.includes("--regen")
  const nonInteractive = args.includes("--non-interactive") || args.includes("--yes")
  const keepNpm = args.includes("--keep-npm")

  const root = process.cwd()
  const tmp = deps.mkdtempSync(path.join(os.tmpdir(), "rnpm-"))
  const backupDir = path.join(tmp, ".backup")
  const proofPath = path.join(root, "rnpm-replication.json")
  const tmpProofPath = path.join(tmp, "rnpm-replication.json")

  let useExistingProof = false

  // If a previous replication file exists, optionally reuse it
  if (!forceRegen && deps.existsSync(proofPath)) {
    if (!nonInteractive) {
      useExistingProof = await deps.promptYesNo(
        "rnpm-replication.json already exists. Verify existing proof?"
      )
    }
  }

  if (useExistingProof) {
    try {
      deps.compareProof()
      console.log("Verification completed")
    } catch (err) {
      console.error("Verification failed:", err.message)
      process.exitCode = 1
    }

    return
  }

  // Save environment for restoration
  const originalNpm = deps.execSync("npm -v", { encoding: "utf8" }).trim()

  try {
    const backupState = deps.backupLockfile(root, backupDir)

    // Replicate lockfile
    await deps.generateProof(tmp)

    // Move the generated proof from the temp workspace into the current dir
    deps.rmSync(proofPath, { force: true })
    deps.moveFileSync(tmpProofPath, proofPath)

    // Compare replicated lockfile with original
    deps.compareProof(backupState.backupPath, proofPath)

    console.log("Verification completed")

  } catch (err) {

    console.error("Verification failed:", err.message)
    process.exitCode = 1

  } finally {
    deps.restoreBackupIfNeeded(root, backupDir)
    deps.removeBackup(root, backupDir)

    // Restore original environments
    if (!keepNpm) {
      deps.restoreEnvironment(originalNpm)
    }

    // Clean up tmp dir
    if (deps.existsSync(tmp)) {
      deps.rmSync(tmp, { recursive: true, force: true })
    }
  }
}

// Restore npm versions
function restoreEnvironment(npmVersion) {
  try {
    execSync(`npm install -g npm@${npmVersion}`, { stdio: "ignore" })
  } catch {}
}

function moveFileSync(src, dst) {
  try {
    fs.renameSync(src, dst)
  } catch (err) {
    if (err.code === "EXDEV") {
      fs.copyFileSync(src, dst)
      fs.unlinkSync(src)
    } else {
      throw err
    }
  }
}

export const __testing__ = {
  runVerifyWith,
}
