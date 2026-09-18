import sys

p = "src/content/integrations.ts"
s = open(p, encoding="utf-8").read()
old = "},,\n  // ======================================================================\n  // Accounting"
new = "},\n  // ======================================================================\n  // Accounting"
idx = s.find("},,")
if idx < 0:
    print("double comma not found")
    sys.exit(1)
# Safety: verify the context after the double comma is the Accounting banner
ctx = s[idx : idx + len(old)]
assert ctx.endswith("// Accounting"), repr(ctx[:80])
s = s[: idx + 1] + s[idx + 2 :]
open(p, "w", encoding="utf-8").write(s)
print("double comma fixed")