import { readFile, readdir, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const errors = [];

const require = Module.createRequire(import.meta.url);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? join(root, request.slice(2)) : request, ...args);
};
Module._extensions['.ts'] = (mod, filename) => {
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  mod._compile(compiled, filename);
};

async function loadSpec(route) {
  const filename = join(root, 'app', 'api', route, 'openapi.json', 'route.ts');
  return (await require(filename).GET()).json();
}

async function routeMethods(file) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest);
  const exported = new Set();
  for (const statement of source.statements) {
    if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(statement) && statement.name) exported.add(statement.name.text.toLowerCase());
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations)
          if (ts.isIdentifier(declaration.name)) exported.add(declaration.name.text.toLowerCase());
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause))
      for (const item of statement.exportClause.elements) exported.add(item.name.text.toLowerCase());
  }
  return [...exported].filter(method => methods.has(method));
}

async function validateCoverage(directory, paths, parts = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) await validateCoverage(fullPath, paths, [...parts, entry.name]);
    if (entry.name !== 'route.ts') continue;
    const path = '/' + parts.join('/').replace(/\[([^\]]+)\]/g, '{$1}');
    for (const method of await routeMethods(fullPath))
      check(Boolean(paths[path]?.[method]), `v1 ${method.toUpperCase()} ${path}: missing from specification`);
  }
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

function resolvePointer(document, pointer) {
  if (!pointer.startsWith('#/')) return undefined;
  return pointer.slice(2).split('/').reduce((value, part) =>
    value?.[part.replaceAll('~1', '/').replaceAll('~0', '~')], document);
}

function visitRefs(value, document, location) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.$ref === 'string')
    check(resolvePointer(document, value.$ref) !== undefined, `${location}: unresolved ${value.$ref}`);
  for (const [key, child] of Object.entries(value)) visitRefs(child, document, `${location}.${key}`);
}

async function validate(name) {
  const document = await loadSpec(name);
  const version = name === 'v1' ? '3.1.0' : '3.0.3';
  check(document.openapi === version, `${name}: expected OpenAPI ${version}`);
  check(Boolean(document.info?.title && document.info?.version), `${name}: missing info`);
  check(Array.isArray(document.servers) && document.servers.length > 0, `${name}: missing servers`);
  check(document.paths && Object.keys(document.paths).length > 0, `${name}: missing paths`);
  const schemes = document.components?.securitySchemes || {};
  const operationIds = new Set();
  const routePrefix = document.servers?.[0]?.url?.replace(/^\/+/, '') || `api/${name}`;

  for (const [path, pathItem] of Object.entries(document.paths || {})) {
    const routePath = path.replace(/\{([^}]+)\}/g, '[$1]');
    const routeFile = join(root, 'app', routePrefix, routePath, 'route.ts');
    try { await access(routeFile); }
    catch { errors.push(`${name}${path}: route.ts does not exist`); }
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      const label = `${name} ${method.toUpperCase()} ${path}`;
      check(operation.responses && Object.keys(operation.responses).length > 0, `${label}: missing responses`);
      const security = operation.security ?? document.security;
      check(Array.isArray(security) && (security.length > 0 || path === '/openapi.json'), `${label}: missing security`);
      for (const requirement of security || []) {
        for (const scheme of Object.keys(requirement))
          check(Boolean(schemes[scheme]), `${label}: unknown security scheme ${scheme}`);
      }
      for (const parameter of path.matchAll(/\{([^}]+)\}/g)) {
        const declared = [...(pathItem.parameters || []), ...(operation.parameters || [])];
        check(declared.some(item => item.in === 'path' && item.name === parameter[1] && item.required === true),
          `${label}: missing required path parameter ${parameter[1]}`);
      }
      if (operation.operationId) {
        check(!operationIds.has(operation.operationId), `${label}: duplicate operationId ${operation.operationId}`);
        operationIds.add(operation.operationId);
      }
    }
  }
  if (name === 'v1') await validateCoverage(join(root, 'app', routePrefix), document.paths);
  visitRefs(document, document, name);
  console.log(`${name}: ${Object.keys(document.paths || {}).length} paths checked`);
}

await validate('v1');
await validate('integrations');
if (errors.length) {
  errors.forEach(error => console.error(error));
  process.exitCode = 1;
} else console.log('OpenAPI contract checks passed.');
