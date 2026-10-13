import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const normalize = value => value.replaceAll('\\', '/')
export function boundaryViolations(file, source, root) {
  const owner = normalize(relative(root, file))
  const errors = []
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  function inspect(specifier) {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return
    const spec = specifier.text
    const target = spec.startsWith('.') ? normalize(relative(root, resolve(dirname(file), spec))) : spec
    const local = spec.startsWith('.')
    if (owner.startsWith('shared/') && (!local || !target.startsWith('shared/'))) errors.push(`${owner}: shared code must depend only on shared code (${spec})`)
    if (owner.startsWith('server/') && local && !target.startsWith('server/') && !target.startsWith('shared/')) errors.push(`${owner}: server cannot import the interface (${spec})`)
    if (owner.startsWith('src/shared/ui/') && local && !target.startsWith('src/shared/ui/')) errors.push(`${owner}: UI primitives cannot import features or business services (${spec})`)
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) inspect(node.moduleSpecifier)
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) inspect(node.argument.literal)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      inspect(node.arguments[0])
      if (owner.startsWith('shared/') && !ts.isStringLiteralLike(node.arguments[0])) errors.push(`${owner}: computed module imports are not allowed in shared code`)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return errors
}
export function checkBoundaries(root = process.cwd()) {
  const scan = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? scan(resolve(dir, item.name)) : /\.(tsx?|mjs|mts)$/.test(item.name) ? [resolve(dir, item.name)] : [])
  const files = ['src', 'server', 'shared'].flatMap(dir => scan(resolve(root, dir)))
  return { count: files.length, errors: files.flatMap(file => boundaryViolations(file, readFileSync(file, 'utf8'), root)) }
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const { count, errors } = checkBoundaries()
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
  else console.log(`Module boundaries verified: ${count} files.`)
}
