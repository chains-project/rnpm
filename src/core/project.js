import fs from "fs"

export function isRnpmProject() {
  if (!fs.existsSync("package-lock.json")) return false

  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"))

  // Note that this check implies we consider corrupted rnpm projects to not be rnpm at all
  // Maybe more user friendly solutions exist?
  return !!lock.rnpm && !!lock.manifestIntegrity
}

export function ensureRnpmProject() {
  if (isRnpmProject()) return "rnpm"

  if (!fs.existsSync("package.json")) {
    console.error(
      "No package.json found. Run 'rnpm init' to create a project."
    )
    process.exit(1)
  }

  return "npm"
}