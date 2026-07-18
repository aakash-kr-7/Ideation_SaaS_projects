import { z } from "zod";
import { reportModeSchema } from "@/lib/report-modes";

export const researchRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
  ideaName: z.string().trim().min(2).max(160),
  ideaDescription: z.string().trim().min(10).max(5_000),
  targetCustomer: z.string().trim().min(2).max(500),
  marketType: z.enum([
    "B2B",
    "D2C",
    "Creator",
    "Developer Tool",
    "Local Business",
    "Agency Tool",
    "Student/Career",
    "Other",
  ]),
  targetRegion: z.string().trim().min(2).max(120),
  assumptions: z.object({
    revenueTarget: z.string().max(100).optional(),
    monetization: z.string().max(100).optional(),
    complexityTolerance: z.string().max(100).optional(),
    platformTolerance: z.string().max(100).optional(),
    regulatoryTolerance: z.string().max(100).optional(),
  }).default({}),
  mode: reportModeSchema,
  idempotencyKey: z.string().uuid(),
});
