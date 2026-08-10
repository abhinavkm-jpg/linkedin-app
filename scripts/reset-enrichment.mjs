// One-off: clear enrichment so every connection re-enriches from scratch with
// the fixed location logic (real profile.location → country name + ISO code).
// Run: node --env-file=.env.local scripts/reset-enrichment.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const [before] = await sql`select count(*)::int n from connections where enriched_at is not null`;
console.log(`Enriched connections before reset: ${before.n}`);

const rows = await sql`
  update connections
     set enriched_at = null,
         location_country = null,
         location_country_code = null
   where enriched_at is not null
  returning id`;
console.log(`Reset ${rows.length} connections. They will re-enrich via the normal daily/send-time jobs.`);
