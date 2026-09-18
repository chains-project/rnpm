import fs from "fs"

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function getPackageName(pkgPath, pkg) {
  if (pkg.name) return pkg.name
  if (pkgPath === "") return pkg.name || "root"

  const parts = pkgPath.split("node_modules/").filter(Boolean)
  return parts[parts.length - 1]
}

function nodeId(pkgPath, pkg) {
  const name = getPackageName(pkgPath, pkg)
  const version = pkg.version || "unknown"

  return `${name}@${version}`
}

function packageNameFromNode(node) {
  const versionSep = node.lastIndexOf("@")
  if (versionSep <= 0) return node
  return node.slice(0, versionSep)
}

function getDependencies(pkg) {
  const dependencies = []

  const add = (deps, type) => {
    if (!deps) return

    for (const depName of Object.keys(deps)) {
      dependencies.push([depName, type])
    }
  }

  add(pkg.dependencies, "prod")
  add(pkg.peerDependencies, "peer")
  add(pkg.optionalDependencies, "optional")
  add(pkg.devDependencies, "dev")

  return dependencies
}

function parentPath(pkgPath) {
  if (!pkgPath) return null

  const parts = pkgPath.split("/")

  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === "node_modules") {
      return parts.slice(0, i).join("/")
    }
  }

  return ""
}

function resolvePath(pkgPath, depName, packages) {
  let currentPath = pkgPath

  while (true) {
    const candidate = currentPath
      ? `${currentPath}/node_modules/${depName}`
      : `node_modules/${depName}`

    if (packages[candidate]) {
      return candidate
    }

    if (currentPath === "") {
      break
    }

    currentPath = parentPath(currentPath)

    if (currentPath === null) {
      break
    }
  }

  return null
}

function addMetadata(metadata, id, pkg) {
  const current = metadata.get(id) ?? {
    sources: new Set(),
    integrities: new Set()
  }

  if (pkg.resolved !== undefined) {
    current.sources.add(pkg.resolved)
  }

  if (pkg.integrity !== undefined) {
    current.integrities.add(pkg.integrity)
  }

  metadata.set(id, current)
}

function buildGraph(lockfile) {
  const nodes = new Set()
  const edges = []
  const metadata = new Map()
  const packages = lockfile.packages ?? {}

  for (const pkgPath in packages) {
    const pkg = packages[pkgPath]
    const fromName = nodeId(pkgPath, pkg)
    const dependencies = getDependencies(pkg)

    nodes.add(fromName)
    addMetadata(metadata, fromName, pkg)

    for (const [depName, type] of dependencies) {
      const fromInstance = pkgPath
      const toInstance = resolvePath(fromInstance, depName, packages)

      if (!toInstance) {
        continue
      }

      const toPkg = packages[toInstance]
      const toName = nodeId(toInstance, toPkg)

      edges.push({
        from: fromName,
        to: toName,
        type
      })
    }
  }

  return { nodes, edges, metadata }
}

function edgeKey(edge) {
  return `${edge.from}|${edge.to}|${edge.type}`
}

function edgeShapeKey(edge) {
  return `${edge.from}|${edge.to}`
}

function packageFromEdgeKey(key) {
  return key.split("|")[1] ?? key
}

function difference(setA, setB) {
  return [...setA].filter(item => !setB.has(item))
}

function subject(items, mapper = item => item) {
  const names = [...new Set(items.map(mapper))]
  if (names.length === 1) return names[0]
  return "multiple packages"
}

function failure(reason, items, mapper) {
  return {
    ok: false,
    reason,
    subject: subject(items, mapper),
    message: `${reason} for ${subject(items, mapper)}`
  }
}

function emptyMetadata() {
  return {
    sources: new Set(),
    integrities: new Set()
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false

  for (const value of a) {
    if (!b.has(value)) return false
  }

  return true
}

function compareMetadata(graphA, graphB) {
  for (const node of graphA.nodes) {
    if (!graphB.nodes.has(node)) continue

    const metaA = graphA.metadata.get(node) ?? emptyMetadata()
    const metaB = graphB.metadata.get(node) ?? emptyMetadata()

    if (!setsEqual(metaA.sources, metaB.sources)) {
      return failure("source mismatch", [node])
    }

    if (!setsEqual(metaA.integrities, metaB.integrities)) {
      return failure("tarball integrity mismatch", [node])
    }
  }

  return { ok: true }
}

function compareGraphs(graphA, graphB) {
  const removedNodes = difference(graphA.nodes, graphB.nodes)
  const addedNodes = difference(graphB.nodes, graphA.nodes)

  if (removedNodes.length > 0 || addedNodes.length > 0) {
    const removedNames = new Set(removedNodes.map(packageNameFromNode))
    const versionMismatches = addedNodes.filter(node =>
      removedNames.has(packageNameFromNode(node))
    )

    if (versionMismatches.length > 0) {
      return failure("mismatching versions", versionMismatches, packageNameFromNode)
    }

    if (addedNodes.length > 0) {
      return failure("new dependencies", addedNodes)
    }

    return failure("removed dependencies", removedNodes)
  }

  const edgesA = new Set(graphA.edges.map(edgeKey))
  const edgesB = new Set(graphB.edges.map(edgeKey))
  const removedEdges = difference(edgesA, edgesB)
  const addedEdges = difference(edgesB, edgesA)

  if (removedEdges.length > 0 || addedEdges.length > 0) {
    const shapesA = new Set(graphA.edges.map(edgeShapeKey))
    const typeMismatches = graphB.edges.filter(edge =>
      shapesA.has(edgeShapeKey(edge)) && !edgesA.has(edgeKey(edge))
    )

    if (typeMismatches.length > 0) {
      return failure("dependency type mismatch", typeMismatches, edge => edge.to)
    }

    if (addedEdges.length > 0) {
      return failure("new dependencies", addedEdges, packageFromEdgeKey)
    }

    return failure("removed dependencies", removedEdges, packageFromEdgeKey)
  }

  const metadataResult = compareMetadata(graphA, graphB)
  if (!metadataResult.ok) return metadataResult

  return { ok: true, message: "lockfiles match" }
}

export function compareLockfiles(fileA, fileB) {
  const graphA = buildGraph(readJson(fileA))
  const graphB = buildGraph(readJson(fileB))

  return compareGraphs(graphA, graphB)
}

export { buildGraph }
