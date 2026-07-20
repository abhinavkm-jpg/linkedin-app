import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { aiPrompts } from "./schema";
import { DEFAULT_SYSTEM_PROMPT } from "../lib/ai/prompts";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = drizzle(neon(url));

  const existing = await db
    .select({ id: aiPrompts.id })
    .from(aiPrompts)
    .where(eq(aiPrompts.isDefault, true))
    .limit(1);

  if (existing.length > 0) {
    console.log("Default AI prompt already exists — nothing to seed.");
    return;
  }

  await db.insert(aiPrompts).values({
    name: "Executive B2B outreach",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    model: "claude-sonnet-5",
    isDefault: true,
  });
  console.log("Seeded default AI prompt.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
