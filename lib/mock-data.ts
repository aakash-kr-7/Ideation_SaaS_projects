import { Opportunity, ResearchRun } from "./types";
import { calculateScore, getVerdict } from "./scoring";

const base = { pain: 88, urgency: 72, willingnessToPay: 78, reachability: 68, competition: 61, complexity: 82, platformRisk: 76, founderFit: 70 };
const total = calculateScore(base);

export const closeSignal: Opportunity = {
  id: "opp_close_signal", name: "CloseSignal", oneLiner: "A client-request command center for boutique bookkeeping firms during month-end close.", targetCustomer: "Owner-operators at 5–30 person bookkeeping firms", market: "B2B", score: { ...base, total }, verdict: getVerdict(total), confidence: 78,
  evidence: [
    { id: "e1", source: "Reddit", sourceType: "r/Bookkeeping", title: "Client document chasing is consuming close week", snippet: "The actual reconciliation is manageable. Getting statements and answers from clients is what turns a three-day close into a week.", url: "https://www.reddit.com/r/Bookkeeping/", signal: "Pain", strength: "High", date: "2026-06-22" },
    { id: "e2", source: "G2", sourceType: "Review", title: "Practice tools are broad, not close-specific", snippet: "We still use a separate spreadsheet to track missing client documents because the portal does not make the status visible enough.", url: "https://www.g2.com/categories/accounting-practice-management", signal: "Demand", strength: "High", date: "2026-05-10" },
    { id: "e3", source: "Competitor pricing", sourceType: "Pricing page", title: "Existing workflow platforms support a clear spend", snippet: "Accounting workflow products commonly start around $50–$200 per firm per month, signalling an established operations budget.", url: "https://www.financetoolbox.com/", signal: "Pricing", strength: "Medium", date: "2026-06-08" },
    { id: "e4", source: "Hacker News", sourceType: "Discussion", title: "Firms hesitate to replace their practice system", snippet: "A narrow add-on that works alongside the existing stack has a more credible adoption path than a full replacement.", url: "https://news.ycombinator.com/", signal: "Risk", strength: "Medium", date: "2026-04-28" },
  ],
  competitors: [
    { id: "c1", name: "Karbon", positioning: "Full practice management for accounting firms", pricing: "Custom / premium", target: "Established accounting firms", strength: "Deep workflow suite", gap: "Too broad for a focused close-week experience" },
    { id: "c2", name: "Financial Cents", positioning: "Workflow management for accounting teams", pricing: "From $19/user/mo", target: "Small to mid-sized firms", strength: "Strong task coordination", gap: "Client request status remains a workflow feature, not the product" },
    { id: "c3", name: "Content Snare", positioning: "Client content collection", pricing: "From $29/mo", target: "Agencies and professionals", strength: "Good collection automation", gap: "Not purpose-built around accounting close rhythms" },
  ],
  pricing: { model: "Firm subscription", pricePoint: "$79/mo", rationale: "Fits below the cost of one missed close-day while remaining an easy add-on purchase.", firstOffer: "$249 paid concierge setup for the first 3 firms", targetCustomers: 13 },
  mvp: { outcome: "A bookkeeper sees every missing client input and sends the next best reminder without opening a spreadsheet.", scope: ["Client request board", "Automated reminder sequences", "Close-status dashboard", "CSV / email import"], exclusions: ["General ledger sync", "Full practice management", "Client portal replacement"], buildEstimate: "2–3 focused weeks" },
  launch: { firstCustomerChannel: "Direct outreach to boutique bookkeeping firm owners on LinkedIn and local accounting communities.", weekOne: ["Interview 8 firm owners about their last close", "Show a clickable status-board prototype", "Offer a paid concierge pilot to 3 qualified firms", "Measure replies and documents received per close"], outreachMessage: "I’m researching how small bookkeeping firms chase documents during close. I’m not selling software yet—could I learn how you track missing client items today?", successMetric: "2 paid pilot commitments or 8 deeply consistent interviews" },
  risks: [
    { id: "r1", category: "Market", severity: "Medium", description: "Firms may accept the spreadsheet workaround as good enough.", mitigation: "Sell time saved during close, then test paid concierge setup before building integrations." },
    { id: "r2", category: "Execution", severity: "Medium", description: "Email deliverability and reminder logic must be dependable.", mitigation: "Start with manual-send approval and simple sequences." },
    { id: "r3", category: "Platform", severity: "Low", description: "No single accounting integration is required for v1.", mitigation: "Keep data import-led; add integrations only after repeat demand." },
  ],
};

export const researchRuns: ResearchRun[] = [
  { id: "run_104", ideaName: "CloseSignal", ideaDescription: closeSignal.oneLiner, targetCustomer: closeSignal.targetCustomer, marketType: "B2B", targetRegion: "United States", mode: "Deep Validation", status: "Completed", createdAt: "2026-07-09", progress: 100, opportunity: closeSignal },
  { id: "run_103", ideaName: "ProposalOS", ideaDescription: "A proposal follow-up assistant for independent agencies.", targetCustomer: "Boutique creative agencies", marketType: "Agency Tool", targetRegion: "English-speaking markets", mode: "Fast Scan", status: "Completed", createdAt: "2026-07-05", progress: 100 },
  { id: "run_102", ideaName: "LessonLoop", ideaDescription: "A retention dashboard for cohort course creators.", targetCustomer: "Course creators", marketType: "Creator", targetRegion: "Global", mode: "Fast Scan", status: "Completed", createdAt: "2026-06-28", progress: 100 },
];

export const compareOpportunities = [closeSignal, { ...closeSignal, id: "opp_proposal", name: "ProposalOS", oneLiner: "A calm proposal follow-up layer for small agencies.", targetCustomer: "Owners of 3–15 person creative agencies", score: { ...closeSignal.score, pain: 73, urgency: 65, willingnessToPay: 70, reachability: 81, competition: 55, complexity: 86, founderFit: 78, total: 73 }, verdict: "Validate first" as const, confidence: 66 }, { ...closeSignal, id: "opp_lesson", name: "LessonLoop", oneLiner: "Identify disengaged learners before cohort completion drops.", targetCustomer: "Cohort-course operators", score: { ...closeSignal.score, pain: 69, urgency: 61, willingnessToPay: 58, reachability: 64, competition: 48, complexity: 74, founderFit: 61, total: 63 }, verdict: "Validate first" as const, confidence: 58 }];
