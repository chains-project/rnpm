import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { recordCommand } from "../src/core/recorder.js"
import { hasPackage } from "../src/cli/update.js"
import { generateProof } from "../src/core/verifier.js"

test("recordCommand preserves history when an untargeted update is appended", () => {
  const root = project([{ command: "install", args: ["first"] }])
  withCwd(root, () => recordCommand({ command: "update", args: [] }))
  const history = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"))).rnpm.history
  assert.deepEqual(history.map(({ command }) => command), ["install", "update"])
  assert.deepEqual(history[0].args, ["first"])
})

test("option values are not package targets", () => {
  assert.equal(hasPackage(["--before", "2026-01-01", "--cache=/tmp/cache"]), false)
  assert.equal(hasPackage(["--registry", "https://registry.npmjs.org", "left-pad"]), true)
  assert.equal(hasPackage(["--", "left-pad"]), true)
})

test("a sole untargeted update retains the manifest during replay", async () => {
  const root = project([{ command: "update", args: ["--before", "2026-01-01"] }])
  const original = fs.readFileSync(path.join(root, "package.json"))
  await withCwd(root, () => generateProof(fs.mkdtempSync(path.join(os.tmpdir(), "rnpm-proof-")), {
    setRecordedEnvironment() {},
    runNpm() {
      assert.deepEqual(fs.readFileSync("package.json"), original)
      fs.writeFileSync("package-lock.json", "{}")
    },
  }))
  assert.deepEqual(fs.readFileSync(path.join(root, "package.json")), original)
})

for (const fail of [false, true]) {
  test(`manifest is restored after ${fail ? "failed" : "successful"} replay`, async () => {
    const root = project([{ command: "install", args: ["first"] }, { command: "update", args: [] }])
    const original = fs.readFileSync(path.join(root, "package.json"))
    let calls = 0
    const replay = withCwd(root, () => generateProof(fs.mkdtempSync(path.join(os.tmpdir(), "rnpm-proof-")), {
      setRecordedEnvironment() {},
      runNpm() {
        calls++
        if (calls === 1) {
          assert.equal(fs.existsSync("package.json"), false)
          assert.equal(fs.existsSync("package-lock.json"), false)
          if (fail) throw new Error("replay failed before manifest creation")
        } else {
          assert.equal(fs.existsSync("package-lock.json"), true)
        }
        fs.writeFileSync("package.json", '{"reconstructed":true}\n')
        fs.writeFileSync("package-lock.json", "{}")
      },
    }))
    if (fail) await assert.rejects(replay, /replay failed/)
    else await replay
    assert.deepEqual(fs.readFileSync(path.join(root, "package.json")), original)
    assert.equal(calls, fail ? 1 : 2)
  })
}

function project(history) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rnpm-history-"))
  fs.writeFileSync(path.join(root, "package.json"), Buffer.from('{\r\n  "name": "fixture"\r\n}\r\n'))
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ rnpm: { history } }))
  return root
}

function withCwd(root, fn) {
  const previous = process.cwd()
  process.chdir(root)
  try { return fn() } finally { process.chdir(previous) }
}
