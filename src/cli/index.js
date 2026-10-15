import { runCommand } from "./commands.js"

const command = process.argv[2]
const args = process.argv.slice(3)

runCommand(command, args)