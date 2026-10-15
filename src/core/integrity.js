import fs from "fs"
import { sha256File } from "../utils/hash.js"

/**
 * Checks that manifestIntegrity matches the hash of package.json.
 *
 * Invariants (must be guaranteed by caller):
 * - package.json exists
 * - package-lock.json exists
 * - lockfile contains "rnpm" and "manifestIntegrity"
 *
 * @returns {{ ok: boolean, expected?: string, actual?: string }}
 */
export function checkIntegrity() {

  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"))

  const currentHash = sha256File("package.json")

  if (currentHash === lock.manifestIntegrity) {
    return { ok: true }
  }

  return {
    ok: false,
    expected: lock.manifestIntegrity,
    actual: currentHash
  }
}