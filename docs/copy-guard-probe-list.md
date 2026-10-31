# Copy-guard probe list — routes to read by hand after a publish

The guard in `src/test/copy-cleanup-141.test.ts` (widened by slice 148) scans the seven
copy roots — `src/components`, `src/content`, `src/routes`, `src/lazy`, `src/tools`,
`src/api`, `src/native` — for retired vocabulary. It is a static check on the source
tree. It cannot prove what the published site actually serves: a lazy route, an SSR
string, or a build-time constant can still put retired copy in front of a buyer.

So after every publish, **read the body text in a browser** on the routes below. A 200
is not proof; open the page and read it.

## Routes that must be probed by hand

Retired-product / agent-era vocabulary has been found live on these before:

| Route | What to look for |
|---|---|
| `/integrations` | the simulator section — no "console" naming an agent, no "executing live workloads", no "blueprint" card copy, plain footer |
| `/demos/workflows` | run the **Invoice** tab with the "Enterprise Consulting Invoice" preset — the extracted line items must not name a retired product or a $5,000 price |
| `/tools` | the Automation Assessment card — "PDF report", not a retired product name |
| `/tools/can-we-automate-this` | result screen heading and the email-capture button label |
| `/tools-hub` | tool index cards |
| `/assessment` | results screen headings, the CTA row (three buttons), and the downloaded PDF's closing line |
| `/pricing` | only $199 / $599 / $1,499 per month, no setup fee, no retired SKU |
| `/workflows` and `/build` | no agent-execution claims |
| `/case-studies`, `/case-studies/*` | `pattern` copy, no retired program |
| `/industries/*`, `/resources/*` | the two routes that leaked "blueprint" before slice 141 |

## Behind login (still shipped copy)

| Route | What to look for |
|---|---|
| `/portal/industries` | "Industry Templates", "Activate Template" — no retired product naming |
| `/portal/admin/workflow-builder` | "Export Workflow (JSON)", `.workflow.json`, no LLM-execution claim in any action card |

## How to probe

1. Open the route in a browser and read the rendered text (not the HTML source).
2. Search the body for: `blueprint`, `agent`, `autonomous`, `sprint`, `connection pack`,
   `Deploy Live`, `$5,000`, and any price other than $199 / $599 / $1,499.
3. For anything interactive (the simulator, the invoice demo, the assessment PDF),
   trigger it — the copy that is "one click away" is the copy that leaked last time.

If a probe finds retired copy, the fix belongs in the source root the guard now scans,
and the guard's term list or root list should be widened so it fails next time.
