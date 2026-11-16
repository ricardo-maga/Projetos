import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Read-only audit unless --write is supplied. Counts candidates, not defects.
const roots = ['app', 'components', 'domains'];
const patterns = {
  palette: /\b(?:bg|text|border|divide|ring|outline|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|blue|indigo|violet|purple|fuchsia|pink|rose|red|orange|amber|yellow|lime|emerald|green|teal|cyan|sky)(?:-\d{2,3})?(?:\/\d+)?\b|\b(?:bg|text|border|fill|stroke)-(?:white|black)(?:\/\d+)?\b/g,
  shape: /\b(?:rounded(?:-[trblse]{1,2})?-(?:none|xs|sm|md|lg|xl|2xl|3xl|full)|shadow-(?:xs|sm|md|lg|xl|2xl|none|inner))\b/g,
  arbitrary: /(?:[\w-]+:)*[\w-]+-\[[^\]\r\n]+\]/g,
  hex: /#[0-9a-fA-F]{3,8}\b/g,
};
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.posix.join(dir, item.name);
    if (item.isDirectory()) walk(name);
    else if (/\.(tsx|css)$/.test(name)) files.push(name);
  }
}
roots.forEach(walk);
const findings = [];
const rows = files.map(file => {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const row = { file, layer: file.startsWith('components/ui/') || file === 'components/M3.tsx' || file.endsWith('.css') ? 'foundation' : 'screen', palette: 0, shape: 0, arbitrary: 0, hex: 0, inline: 0, styleProps: 0, sharedImports: 0 };
  const record = (category, value, offset) => {
    row[category]++;
    findings.push({ file, line: source.slice(0, offset).split('\n').length, category, value });
  };
  const scan = (value, offset) => {
    for (const [category, regex] of Object.entries(patterns)) {
      for (const match of value.matchAll(regex)) record(category, match[0], offset + match.index);
    }
  };
  if (file.endsWith('.css')) {
    // Preserve offsets while excluding comments.
    scan(source.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')), 0);
  } else {
    function visit(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) scan(node.text, node.getStart(ast) + 1);
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'style') record('inline', node.getText(ast), node.getStart(ast));
      if (ts.isJsxAttribute(node) && /Style$/.test(node.name.getText(ast))) record('styleProps', node.getText(ast), node.getStart(ast));
      if (ts.isImportDeclaration(node) && /(?:components\/(?:ui|M3)|\/ui\/)/.test(node.moduleSpecifier.text)) row.sharedImports++;
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return row;
});
const totals = rows.reduce((sum, row) => { for (const key of Object.keys(patterns).concat('inline', 'styleProps')) sum[key] = (sum[key] || 0) + row[key]; return sum; }, {});
const result = { scope: roots, files: files.length, totals, rows, findings };
if (process.argv.includes('--write')) {
  fs.writeFileSync('docs/visual-style-inventory.json', JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ files: files.length, totals, screens: rows.filter(r => r.layer === 'screen').sort((a, b) => (b.palette + b.shape + b.inline) - (a.palette + a.shape + a.inline)).slice(0, 20) }, null, 2));
