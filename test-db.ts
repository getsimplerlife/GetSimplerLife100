import { createClient } from "@libsql/client";

const url = process.env.TEAM_DB_URL;
const authToken = process.env.TEAM_DB_AUTH_TOKEN;

console.log("Connecting to:", url);

const client = createClient({
  url: url!,
  authToken: authToken!,
});

try {
  const result = await client.execute("SELECT 1");
  console.log("Success:", result.rows);
} catch (err) {
  console.error("Failure:", err);
}
