import { createAuditForEmail } from "../src/db/queries";

async function test() {
  console.log("Testing createAuditForEmail...");
  try {
    const result = await createAuditForEmail({ 
      data: { 
        email: "test-purchase@example.com", 
        type: "QuickScan" 
      } 
    });
    console.log("Result:", result);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
