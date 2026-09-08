import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { linkedinAccounts, accountPromptSets } from "@/db/schema";
import { generateMessage, type OutreachStep, type ProspectContext } from "@/lib/ai/generate";
import { contentInstruction } from "@/lib/outreach/content";

async function main() {
  const [acct] = await db
    .select({ defaultPrompt: linkedinAccounts.defaultPrompt, differentiators: linkedinAccounts.differentiators, name: linkedinAccounts.name })
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.name, "Sandeep Mohan"))
    .limit(1);
  const sets = await db.select().from(accountPromptSets);
  const task = (stage: string) => sets.find((s) => s.stage === stage)?.promptText ?? undefined;

  const prospect: ProspectContext = {
    firstName: "Neta", lastName: "Ilovich", headline: "VP Marketing, growth + user journey",
    company: "Acme", position: "VP Marketing", segmentVertical: "saas", segmentTier: "ATL",
    summary: "Leads growth marketing, focused on funnel experimentation and pipeline.",
  };
  const stages: OutreachStep[] = ["welcome", "follow_up_1", "follow_up_2", "follow_up_3", "follow_up_4"];
  const prior: { from: "me" | "them"; text: string }[] = [];

  for (const stage of stages) {
    const useDiff = stage !== "welcome";
    const instructions = stage === "follow_up_2"
      ? contentInstruction([{ title: "Lead gen vs demand gen", url: "https://machintel.com/blog/lead-generation-vs-demand-generation-know-the-difference-to-win/" }])
      : undefined;
    const res = await generateMessage({
      step: stage,
      prospect,
      systemPrompt: acct.defaultPrompt ?? undefined,
      taskInstruction: task(stage),
      instructions,
      credibilityBank: useDiff ? acct.differentiators ?? undefined : undefined,
      signOffName: acct.name?.split(/\s+/)[0],
      priorMessages: [...prior],
    });
    const wc = res.text.replace(/https?:\/\/\S+/g, "").trim().split(/\s+/).length;
    console.log(`\n===== ${stage}  [${wc} words]  signs "${/sandeep/i.test(res.text) ? "Sandeep ✓" : "?? ✗"}"\n${res.text}`);
    prior.push({ from: "me", text: res.text });
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
