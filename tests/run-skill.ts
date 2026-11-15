// Interactive Single-Skill CLI Runner
// Usage: node --experimental-strip-types tests/run-skill.ts <skill_id>
// Example: node --experimental-strip-types tests/run-skill.ts skill_competitor_analysis

import { SKILLS, executeSkill } from "../src/lib/server/skills/index.ts";

const skillId = process.argv[2] || "skill_competitor_analysis";

const sampleInputs: Record<string, Record<string, unknown>> = {
  skill_market_research: {
    topic: "Study Abroad AI counseling market in India Tier-2 cities",
    targetMarket: "Undergraduate STEM students looking for UK & US colleges",
  },
  skill_competitor_analysis: {
    primaryEntity: "MeetUniversity",
    competitors: "LeapScholar, Leverage Edu, IDP Education",
    focusAreas: "Counseling Fees, Visa Approval Rates, AI Capabilities, University Tie-ups",
  },
  skill_financial_modelling: {
    businessModel: "B2C EdTech Study Abroad Platform",
    pricing: "₹45,000 per student counseling package + 10% university commission",
    cac: "₹12,000 blended CAC across Meta and Google ads",
    churnRate: "N/A (One-time cohort with 20% sibling/referral rate)",
  },
  skill_presentation_creation: {
    topic: "MeetUniversity Seed Round Pitch Deck",
    targetAudience: "Venture Capitalists & Angel Investors",
    slideCount: 5,
  },
  skill_email_drafting: {
    objective: "Propose an exclusive scholarship partnership for Indian students",
    recipient: "Dean of Global Admissions, Arizona State University",
    tone: "persuasive",
    details: "MeetUniversity has 50,000+ verified GRE/IELTS candidates ready for Fall 2027",
  },
  skill_code_review: {
    codeSnippet: `
router.post("/transfer-credits", async (req, res) => {
  const { studentId, targetCollegeId, credits } = req.body;
  // Vulnerability: No auth check, no transaction lock, direct mutation
  const student = await db.findStudent(studentId);
  student.credits -= credits;
  await db.updateStudent(student);
  await db.addCreditsToCollege(targetCollegeId, credits);
  res.json({ status: "success" });
});`,
    language: "TypeScript",
    focus: "security",
  },
  skill_data_analysis: {
    datasetDescription: `
Month | Inquiries | Application Started | Completed | Visa Approved
Jan   | 10,000    | 2,500               | 800       | 720
Feb   | 14,000    | 3,100               | 920       | 810
Mar   | 18,000    | 2,200               | 500       | 420  <-- Major Drop
Apr   | 22,000    | 2,100               | 480       | 390  <-- Anomaly
`,
    targetMetric: "Application Completion Rate Drop",
    context: "March-April witnessed 50%+ drop in completions despite higher inquiries.",
  },
  skill_lead_generation: {
    offering: "MeetUniversity High School Counselor Dashboard",
    targetIndustry: "K-12 Private International Schools in India (IB/Cambridge)",
    geography: "Mumbai, Delhi-NCR, Bangalore, Hyderabad",
  },
};

async function main() {
  console.log("\n================================================================================");
  console.log(`🎯 OPENCREWBOT 2.0 — DIRECT SKILL TEST RUNNER: [${skillId.toUpperCase()}]`);
  console.log("================================================================================\n");

  const skill = SKILLS[skillId];
  if (!skill) {
    console.error(`❌ Unknown skill "${skillId}". Available skills:`);
    Object.keys(SKILLS).forEach((id) => console.log(`   - ${id}`));
    process.exit(1);
  }

  const inputs = sampleInputs[skillId] || {};
  console.log(`📌 Skill Name:    ${skill.name}`);
  console.log(`📋 Category:      ${skill.category.toUpperCase()}`);
  console.log(`📥 Test Inputs:   ${JSON.stringify(inputs, null, 2)}\n`);

  console.log("⚡ Executing Skill via Multi-Model Engine...");
  const startTime = Date.now();
  const result = await executeSkill(skillId, inputs, {
    preferredLanguage: "english",
    invokingAgentRole: "Lead Specialist",
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✨ Execution Succeeded in ${duration}s via Engine: ${result.engineUsed.toUpperCase()}\n`);
  console.log("================================================================================");
  console.log("📄 SKILL GENERATED DELIVERABLE:");
  console.log("================================================================================\n");
  console.log(result.output);
  console.log("\n================================================================================\n");
}

main().catch(console.error);

