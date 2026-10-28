import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const errors = [];

async function loadSpec(route) {
  const filename = join(root, 'app', 'api', route, 'openapi.json', 'route.ts');
  const source = await readFile(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const routeModule = new Module(filename);
  routeModule.filename = filename;
  routeModule.paths = Module._nodeModulePaths(dirname(filename));
  routeModule._compile(compiled, filename);
  return (await routeModule.exports.GET()).json();
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
  check(document.openapi === '3.0.3', `${name}: expected OpenAPI 3.0.3`);
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
      check(Array.isArray(security) && security.length > 0, `${label}: missing security`);
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
  visitRefs(document, document, name);
  console.log(`${name}: ${Object.keys(document.paths || {}).length} paths checked`);
}

await validate('v1');
await validate('integrations');
if (errors.length) {
  errors.forEach(error => console.error(error));
  process.exitCode = 1;
} else console.log('OpenAPI contract checks passed.');
