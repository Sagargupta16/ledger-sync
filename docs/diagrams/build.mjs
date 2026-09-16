// Regenerate checked Archify HTML and passive SVG previews for the docs.
// The HTML is never rewritten after Archify's atomic delivery.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const diagramDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(diagramDir, '../..')
const diagrams = [
  ['architecture', 'system-architecture'],
  ['sequence', 'statement-import'],
  ['dataflow', 'financial-calculations'],
  ['workflow', 'release-delivery'],
]
const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const skillArg = args.indexOf('--skill')
const skillDir = skillArg >= 0
  ? args[skillArg + 1]
  : process.env.ARCHIFY_SKILL_DIR || path.join(os.homedir(), '.agents/skills/archify')
if (skillArg >= 0 && (!skillDir || skillDir.startsWith('--'))) {
  throw new Error('--skill requires the Archify skill directory')
}
const cli = path.join(skillDir, 'bin/archify.mjs')

function fingerprint(file) {
  const bytes = fs.readFileSync(file)
  return { path: path.basename(file), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
}

function invokeArchify(commandArgs) {
  const result = spawnSync(process.execPath, [cli, ...commandArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    // Windows validation needs a writable, resolvable temporary directory.
    env: { ...process.env, TEMP: diagramDir, TMP: diagramDir, TMPDIR: diagramDir },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stdout || result.stderr || 'Archify failed')
  return JSON.parse(result.stdout)
}

function staticPreview(html) {
  const matches = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)]
  if (matches.length !== 1) throw new Error('Expected one delivered diagram SVG')
  const svg = matches[0][0]
  if (/<script\b/i.test(svg) || /(?:href|src)\s*=\s*["'](?:https?:)?\/\//i.test(svg)) {
    throw new Error('Static preview must contain no script or remote resource')
  }
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n')
  const box = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (!box || !styles) throw new Error('Delivered diagram is missing its geometry or stylesheet')
  const opening = svg.match(/^<svg\b[^>]*>/)[0].replace(/>$/, (
    ` xmlns="http://www.w3.org/2000/svg" data-theme="light" width="${box[1]}" height="${box[2]}">`
  ))
  // Image proxies and SVG rasterizers do not all support CSS custom properties.
  // Resolve the fixed light palette for this passive export, preserving geometry.
  const palette = new Map()
  for (const selector of [/:root,\s*\[data-theme="dark"\]\s*\{([^}]+)\}/, /\[data-theme="light"\]\s*\{([^}]+)\}/]) {
    for (const [, key, value] of styles.match(selector)[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      palette.set(key, value.trim())
    }
  }
  const resolvePalette = (text) => text.replace(/var\((--[\w-]+)\)/g, (original, key) => palette.get(key) ?? original)
  const css = `${resolvePalette(styles)}\nsvg { min-width: 0; height: auto; transition: none; font-family: 'JetBrains Mono', monospace; }\n`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Passive preview extracted from Archify's delivered SVG; see ARCHIFY-LICENSE.txt. -->\n`
    + opening + `\n<style><![CDATA[${css.replaceAll(']]>', ']]]]><![CDATA[>')}]]></style>\n`
    + `<rect width="100%" height="100%" fill="${palette.get('--panel')}" />\n`
    + resolvePalette(svg.slice(svg.indexOf('>') + 1)) + '\n'
}

for (const [type, name] of diagrams) {
  const specification = path.join(diagramDir, `${name}.${type}.json`)
  const artifact = path.join(diagramDir, `${name}.html`)
  const preview = path.join(diagramDir, `${name}.svg`)
  const receiptFile = path.join(diagramDir, `${name}.delivery.json`)
  if (!checkOnly) {
    const evidenceArgs = type === 'architecture' ? ['--repo-root', repoRoot] : []
    invokeArchify(['validate', type, specification, '--quality', 'showcase', '--json', ...evidenceArgs])
    const delivered = invokeArchify(['deliver', type, specification, artifact, '--quality', 'showcase', '--json', ...evidenceArgs])
    if (delivered.validation.checksPassed !== 9 || delivered.validation.errors || delivered.validation.warnings) {
      throw new Error(`${name}: full showcase acceptance is required`)
    }
    fs.writeFileSync(preview, staticPreview(fs.readFileSync(artifact, 'utf8')))
    const receipt = {
      generator: 'Archify',
      type,
      specification: fingerprint(specification),
      artifact: fingerprint(artifact),
      preview: fingerprint(preview),
      validation: delivered.validation,
      ...(delivered.evidence ? { evidence: delivered.evidence } : {}),
    }
    fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n')
  }
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'))
  if (receipt.validation.checksPassed !== 9 || receipt.validation.checkCount !== 9
    || receipt.validation.compositionProfile !== 'showcase' || receipt.validation.compositionStatus !== 'pass'
    || receipt.validation.errors || receipt.validation.warnings) {
    throw new Error(`${name}: receipt does not record full showcase acceptance`)
  }
  // The HTML viewer is generated output and is gitignored, so a fresh checkout
  // has only the specification and the SVG. Fingerprint what is present rather
  // than failing on the intended state; a local build restores the HTML and the
  // stricter comparison below runs again.
  const artifactPresent = fs.existsSync(artifact)
  const kinds = [['specification', specification], ['preview', preview]]
  if (artifactPresent) kinds.splice(1, 0, ['artifact', artifact])
  for (const [kind, file] of kinds) {
    const current = fingerprint(file)
    if (current.sha256 !== receipt[kind].sha256 || current.bytes !== receipt[kind].bytes) {
      throw new Error(`${name}: ${kind} differs from the delivery receipt`)
    }
  }
  if (artifactPresent
    && fs.readFileSync(preview, 'utf8') !== staticPreview(fs.readFileSync(artifact, 'utf8'))) {
    throw new Error(`${name}: static preview no longer matches the delivered SVG`)
  }
  console.log(
    artifactPresent
      ? `${name}: 9/9 showcase; specification, HTML, and SVG hashes match`
      : `${name}: 9/9 showcase; specification and SVG hashes match (HTML not built)`,
  )
}
