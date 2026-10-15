import fs from "fs"

import { runInstall } from "./install.js"
import { runUninstall } from "./uninstall.js"
import { runUpdate, hasPackage } from "./update.js"
import { runVerify } from "./verify.js"
import { runInit } from "./init.js"

import { ensureRnpmProject } from "../core/project.js"
import { checkIntegrity } from "../core/integrity.js"
import { promptYesNo } from "../utils/prompt.js"

function hasFlag(args, ...flags) {
  return args.some((arg) => flags.includes(arg))
}

/**
 * Entry point for CLI commands.
 * 
 * Handles:
 * - Project initialization checks
 * - rnpm project enforcement
 * - Integrity validation
 * - Command dispatch to handlers
 * @param {string} command - CLI command (install, update, init, verify) 
 * @param {string[]} args - Command arguments 
 * @returns 
 */
export async function runCommand(command, args) {
  const nonInteractive = hasFlag(args, "--non-interactive", "--yes")

  // Ensure project exists unless making a new one
  if (!fs.existsSync("package.json") && command !== "init") {
    console.log(command)
    console.error(
      "No package.json found. Run 'rnpm init [options]' to create a project."
    )
    process.exit(1)
  }

  // Handle initialization separately
  if (command === "init") {
    runInit(args)
    return
  }

  const isPlainUpdate = command === "update" && !hasPackage(args)

  // Is is an rnpm project?
  let projectState
  try {
    projectState = ensureRnpmProject()
  } catch (err) {
    console.error(`Invalid package-lock.json: ${err.message}`)
    process.exit(1)
  }
  const isRnpmProject = projectState === "rnpm"

  // Plain update should work on both npm and rnpm projects.
  if (isPlainUpdate) {
    if (isRnpmProject) {
      let integrity
      try {
        integrity = checkIntegrity()
      } catch (err) {
        console.error(`Failed to check lockfile integrity: ${err.message}`)
        process.exit(1)
      }

      if (!integrity.ok) {
        if (nonInteractive) {
          console.error(
            "package.json differs from the last rnpm command. Run interactively to confirm a lockfile update."
          )
          process.exit(1)
        }

        const ok = await promptYesNo(
          "package.json differs from the last rnpm command. Continue? (This will trigger a lockfile update)"
        )

        if (!ok) process.exit(1)

        // Sync lockfile with package.json
        runUpdate()
      }
    }

    runUpdate(args)
    return
  }

  // Non-update commands and targeted updates on npm projects go through conversion first.
  if (!isRnpmProject) {
    if (nonInteractive) {
      console.error(
        "This is not an rnpm project. Run interactively to convert it before verifying."
      )
      process.exit(1)
    }

    const ok = await promptYesNo(
      "This is not an rnpm project. Convert it? (This will trigger a lockfile update)"
    )

    if (!ok) process.exit(0)

    const conversionArgs = []

    const ignoreScripts = await promptYesNo(
      "Ignore scripts when converting? (Adds --ignore-scripts)"
    )

    if (ignoreScripts) {
      conversionArgs.push("--ignore-scripts")
    }

    const lockfileOnly = await promptYesNo(
      "Skip physical installation when converting? (Adds --package-lock-only)"
    )

    if (lockfileOnly) {
      conversionArgs.push("--package-lock-only")
    }

    runUpdate(conversionArgs)
    return
  }

  // Check integrity
  let integrity
  try {
    integrity = checkIntegrity()
  } catch (err) {
    console.error(`Failed to check lockfile integrity: ${err.message}`)
    process.exit(1)
  }

  if (!integrity.ok) {
    if (nonInteractive) {
      console.error(
        "package.json differs from the last rnpm command. Run interactively to confirm a lockfile update."
      )
      process.exit(1)
    }

    const ok = await promptYesNo(
      "package.json differs from the last rnpm command. Continue? (This will trigger a lockfile update)"
    )

    if (!ok) process.exit(1)

    // Sync lockfile with package.json
    runUpdate()
  }

  // Dispatch command to handler
  switch (command) {

    case "install":
    case "i":
      runInstall(args)
      break

    case "update":
      runUpdate(args)
      break

    case "uninstall":
    case "remove":
    case "rm":
    case "un":
      runUninstall(args)
      break

    case "verify":
      runVerify(args)
      break

    default:
      console.log("Usage: rnpm <install|uninstall|update|init|verify>")
  }
}
