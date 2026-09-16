/* حارس انحدار: لا معرفات مكررة في ماركاب البلياردو (سبب عطل UI-v3 الأول) */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/games/billiards.js', 'utf8');
const ids = [...src.matchAll(/id=\\?"([A-Za-z0-9_]+)\\?"/g)].map(m => m[1]);
const seen = {}, dups = [];
ids.forEach(id => { seen[id] = (seen[id] || 0) + 1; });
Object.keys(seen).forEach(id => { if (seen[id] > 1) dups.push(id + 'x' + seen[id]); });
if (dups.length) { console.log('✗ معرفات مكررة: ' + dups.join(', ')); process.exit(1); }
console.log('═══ Billiards dup-id: ' + Object.keys(seen).length + ' ids unique — passed ═══');
