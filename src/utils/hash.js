import fs from "fs"
import crypto from "crypto"

export function sha256File(path) {
  const data = fs.readFileSync(path)
  return crypto.createHash("sha256").update(data).digest("hex")
}