import fs from 'fs';
const content = fs.readFileSync('dist/client/assets/index-B4zunMVR.js','utf8');
let idx = 0;
const matches = [];
while((idx = content.indexOf('.filter(', idx)) !== -1) {
  const before = content.substring(Math.max(0, idx-40), idx);
  const isProtected = /(\|\||\[\]|\?\.|Array|Boolean|filter)\s*$/.test(before);
  if (!isProtected) {
    matches.push({pos: idx, before: before.trim()});
  }
  idx++;
}
console.log('=== Potentially vulnerable .filter() calls ===');
matches.slice(0, 20).forEach(m => console.log('pos ' + m.pos + ': ...' + m.before.slice(-50) + '.filter('));
console.log('Total: ' + matches.length);

// Also show the exact content around line2:10212
const lines = content.split('\n');
const line = lines[1];
const start = Math.max(0, 10200);
const end = Math.min(line.length, 10350);
console.log('\n=== Around position 10212 (line 2) ===');
console.log(line.substring(start, end));
