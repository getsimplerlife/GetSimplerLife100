import { createAuditForEmailInternal } from "../src/db/queries";

async function main() {
  const result = await createAuditForEmailInternal("mathewortiz97@gmail.com", "Deep-Dive AI Opportunity Audit");
  console.log("Created audit:", JSON.stringify(result, null, 2));
}
main().catch(console.error);
