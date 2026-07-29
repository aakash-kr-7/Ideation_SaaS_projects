import type { CanonicalResearchBrief } from "./research-brief.ts";

export type CompetitorSeedCategory =
  | "client_approval"
  | "workflow_automation"
  | "ai_developer_tool"
  | "food_waste_consumer"
  | "consumer_product"
  | "local_service"
  | "marketplace";

export interface CompetitorSeed {
  categoryId: CompetitorSeedCategory;
  candidateName: string;
  canonicalHomepage: string;
  categoryRationale: string;
  candidateType: "direct" | "adjacent";
  lastReviewed: {
    date: string;
    reviewer: "ShouldBuild";
  };
}

const reviewed = { date: "2026-07-29", reviewer: "ShouldBuild" as const };

export const COMPETITOR_SEED_REGISTRY: readonly CompetitorSeed[] = [
  {
    categoryId: "client_approval",
    candidateName: "Filestage",
    canonicalHomepage: "https://filestage.io/",
    categoryRationale: "Candidate serving review and approval workflows.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "client_approval",
    candidateName: "Ziflow",
    canonicalHomepage: "https://www.ziflow.com/",
    categoryRationale: "Candidate serving online proofing and approval workflows.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "workflow_automation",
    candidateName: "Process Street",
    canonicalHomepage: "https://www.process.st/",
    categoryRationale: "Candidate serving repeatable business workflow management.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "workflow_automation",
    candidateName: "Zapier",
    canonicalHomepage: "https://zapier.com/",
    categoryRationale: "Adjacent automation alternative that may replace a narrow workflow product.",
    candidateType: "adjacent",
    lastReviewed: reviewed,
  },
  {
    categoryId: "ai_developer_tool",
    candidateName: "GitHub Copilot",
    canonicalHomepage: "https://github.com/features/copilot",
    categoryRationale: "Candidate serving AI-assisted developer workflows.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "ai_developer_tool",
    candidateName: "Cursor",
    canonicalHomepage: "https://www.cursor.com/",
    categoryRationale: "Candidate serving AI-assisted coding workflows.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "food_waste_consumer",
    candidateName: "Samsung Food",
    canonicalHomepage: "https://samsungfood.com/",
    categoryRationale: "Candidate serving household meal planning and food-use workflows.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "food_waste_consumer",
    candidateName: "NoWaste",
    canonicalHomepage: "https://www.nowasteapp.com/",
    categoryRationale: "Candidate serving household food inventory and expiry tracking.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "consumer_product",
    candidateName: "Product Hunt",
    canonicalHomepage: "https://www.producthunt.com/",
    categoryRationale: "Adjacent discovery channel and category-activity reference for consumer launches.",
    candidateType: "adjacent",
    lastReviewed: reviewed,
  },
  {
    categoryId: "local_service",
    candidateName: "Urban Company",
    canonicalHomepage: "https://www.urbancompany.com/",
    categoryRationale: "Candidate providing booked home-maintenance services in Indian cities.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "local_service",
    candidateName: "Thumbtack",
    canonicalHomepage: "https://www.thumbtack.com/",
    categoryRationale: "Candidate connecting consumers with local service professionals.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "local_service",
    candidateName: "Yelp",
    canonicalHomepage: "https://www.yelp.com/",
    categoryRationale: "Adjacent local discovery and reputation alternative.",
    candidateType: "adjacent",
    lastReviewed: reviewed,
  },
  {
    categoryId: "marketplace",
    candidateName: "LabX",
    canonicalHomepage: "https://www.labx.com/",
    categoryRationale: "Candidate marketplace for laboratory and scientific equipment.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "marketplace",
    candidateName: "EquipNet",
    canonicalHomepage: "https://www.equipnet.com/",
    categoryRationale: "Candidate marketplace and asset-disposition service for used equipment.",
    candidateType: "direct",
    lastReviewed: reviewed,
  },
  {
    categoryId: "marketplace",
    candidateName: "Sharetribe",
    canonicalHomepage: "https://www.sharetribe.com/",
    categoryRationale: "Candidate providing infrastructure for two-sided marketplaces.",
    candidateType: "adjacent",
    lastReviewed: reviewed,
  },
] as const;

export function classifyCompetitorSeedCategory(
  brief: CanonicalResearchBrief,
): CompetitorSeedCategory {
  const text = normalize(
    `${brief.exactProductProposition} ${brief.targetBuyer} ${brief.workflowChanged} ${brief.directCompetitorCategory} ${brief.businessModel}`,
  );
  if (/approval|sign off|signoff|proofing|audit trail/.test(text)) return "client_approval";
  if (/developer|coding|code review|repository|api|devops|ai assistant/.test(text)) return "ai_developer_tool";
  if (/marketplace|two sided|buyers and sellers|supply and demand/.test(text)) return "marketplace";
  if (/local service|home service|nearby|appointment|tradesperson|contractor/.test(text)) return "local_service";
  if (/grocery|groceries|pantry|food waste|expir|meal planning/.test(text)) return "food_waste_consumer";
  if (/consumer|individual|household|personal|mobile app/.test(text)) return "consumer_product";
  return "workflow_automation";
}

export function seedsForBrief(brief: CanonicalResearchBrief) {
  const categoryId = classifyCompetitorSeedCategory(brief);
  return {
    categoryId,
    candidates: COMPETITOR_SEED_REGISTRY.filter((seed) =>
      seed.categoryId === categoryId
    ),
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
