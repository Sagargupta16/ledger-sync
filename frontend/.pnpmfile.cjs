// TypeScript 7 (the project `typescript`) ships no JS compiler API, and
// typescript-eslint 8 requires `typescript <6.1.0`. pnpm resolves a peer from
// the parent project, so a range override alone still links TypeScript 7.
// This hook turns typescript-eslint's `typescript` peer into a regular
// TypeScript 6 dependency: `tsc` runs 7 while lint keeps parsing with 6.
// Delete this file once a stable typescript-eslint supports TypeScript 7.
const TYPESCRIPT_6 = '6.0.3'

function needsTypeScript6(name) {
  return name === 'typescript-eslint' || name === 'ts-api-utils' || name.startsWith('@typescript-eslint/')
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (needsTypeScript6(pkg.name) && pkg.peerDependencies?.typescript) {
        delete pkg.peerDependencies.typescript
        if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript
        pkg.dependencies = { ...pkg.dependencies, typescript: TYPESCRIPT_6 }
      }
      return pkg
    },
  },
}
