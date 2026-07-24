#!/usr/bin/env node
const fs = require("fs");
let content = fs.readFileSync("/home/team/shared/site/standalone-server.ts", "utf8");

// 1. Change TENANT_PURCHASES_FILE from purchases.json to tenant_purchases.json
content = content.replace(
  'const TENANT_PURCHASES_FILE = DATA_DIR + "/purchases.json";',
  'const TENANT_PURCHASES_FILE = DATA_DIR + "/tenant_purchases.json";'
);

// 2. Fix all 3 gate checks: change from some(p => p.status === "active") to length === 0
const oldGate = [
  '    const userPurchases = purchases[user.email] || [];\n    const hasActivePurchase = userPurchases.some((p: any) => p.status === "active");\n    if (!hasActivePurchase) {',
  '    const userPurchases = purchases[user.email] || [];\n    const hasActivePurchase = userPurchases.some((p: any) => p.status === "active");',
];
const newGate = [
  '    const userPurchases = purchases[user.email] || [];\n    if (userPurchases.length === 0) {',
  '    const userPurchases = purchases[user.email] || [];',
];

let count = 0;
oldGate.forEach((old, i) => {
  while (content.includes(old)) {
    content = content.replace(old, newGate[i]);
    count++;
  }
});

console.log("Replacements made:", count);

fs.writeFileSync("/home/team/shared/site/standalone-server.ts", content, "utf8");
console.log("Wrote standalone-server.ts");

// Verify
const check = fs.readFileSync("/home/team/shared/site/standalone-server.ts", "utf8");
console.log("tenant_purchases refs:", (check.match(/tenant_purchases/g) || []).length);
console.log("mathewortiz97 refs:", (check.match(/mathewortiz97@gmail.com/g) || []).length);
console.log("Purchase required refs:", (check.match(/Purchase required/g) || []).length);
console.log("userPurchases.length === 0 refs:", (check.match(/userPurchases\.length === 0/g) || []).length);
