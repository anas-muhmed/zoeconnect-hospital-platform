const fs = require('fs');
const path = require('path');
const ts = require('typescript');

let total = 0, errors = 0;
const errFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && /\.ts$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      total++;
      const src = fs.readFileSync(full, 'utf8');
      const result = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        reportDiagnostics: true,
      });
      if (result.diagnostics && result.diagnostics.length > 0) {
        errors++;
        errFiles.push(full);
      }
    }
  }
}

walk('src');
console.log(`Total .ts files: ${total}`);
console.log(`Files with syntax errors: ${errors}`);
if (errFiles.length) {
  console.log('Error files:');
  errFiles.forEach(f => console.log(' - ' + f));
}
