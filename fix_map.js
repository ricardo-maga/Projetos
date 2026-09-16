const fs = require('fs');
let code = fs.readFileSync('lib/supabaseSync.ts', 'utf8');

// Match state.someArray.map(x => ...
code = code.replace(/state\.([A-Za-z0-9_]+)\.map\(([a-zA-Z0-9_]+)\s*=>/g, 'state.$1.map(($2: any) =>');
// Match (state.someArray || []).map(x => ...
code = code.replace(/\(state\.([A-Za-z0-9_]+)\s*\|\|\s*\[\]\)\.map\(([a-zA-Z0-9_]+)\s*=>/g, '(state.$1 || []).map(($2: any) =>');
// Match dbSomeArray.map(x => ...
code = code.replace(/db([A-Za-z0-9_]+)\.map\(([a-zA-Z0-9_]+)\s*=>/g, 'db$1.map(($2: any) =>');
// Match someArray.map(x => ... for general variables
code = code.replace(/\.map\(([a-zA-Z0-9_]+)\s*=>/g, '.map(($1: any) =>');

fs.writeFileSync('lib/supabaseSync.ts', code);
