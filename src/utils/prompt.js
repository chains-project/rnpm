import readline from "readline"

export function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    function ask() {
      rl.question(`${question} [Y/n] `, (answer) => {
        const a = answer.trim().toLowerCase()

        if (a === "" || a === "y" || a === "yes") {
          rl.close()
          resolve(true)
        } else if (a === "n" || a === "no") {
          rl.close()
          resolve(false)
        } else {
          console.log("Please answer y or n.")
          ask()
        }
      })
    }

    ask()
  })
}