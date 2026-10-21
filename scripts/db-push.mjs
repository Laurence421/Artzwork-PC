// Applies supabase/migrations to the database in SUPABASE_DB_URL (.env.db, never uploaded).
// Usage: npm run db:push            -> push
//        npm run db:push -- --dry-run -> list what would be applied
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const url = process.env.SUPABASE_DB_URL;
if (!url || url.includes("YOUR-PASSWORD")) {
  console.error("Set SUPABASE_DB_URL in .env.db (replace YOUR-PASSWORD with the database password).");
  process.exit(1);
}

// Run npx through node itself (no shell), so characters in the password are passed as-is.
const npxCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
const result = spawnSync(
  process.execPath,
  [npxCli, "-y", "supabase@2", "db", "push", "--db-url", url, "--include-all", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
