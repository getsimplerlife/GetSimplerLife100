const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'standalone-server.ts');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Fix: replace \' with ' on all lines EXCEPT line 1052 (0-indexed: 1051)
// Line 1052 has \' inside double-quoted TS string which is valid
let fixed = 0;
for (let i = 0; i < lines.length; i++) {
  if (i === 1051) continue; // skip line 1052 (0-indexed)
  const before = lines[i].length;
  lines[i] = lines[i].replace(/\\'/g, "'");
  if (lines[i].length !== before) fixed++;
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log(`Fixed ${fixed} lines. Line 1052 preserved.`);
