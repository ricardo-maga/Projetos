const fs = require('fs');
let code = fs.readFileSync('app/api/v1/projects/route.ts', 'utf-8');

code = code.replace(/title: body.title,/, 'project_title: body.title,');
code = code.replace(/title: p.title,/, 'title: p.project_title || p.title,');

fs.writeFileSync('app/api/v1/projects/route.ts', code);
console.log('API projects patched');
