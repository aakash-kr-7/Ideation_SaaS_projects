import { z } from "zod";
export const researchRequestSchema=z.object({ideaName:z.string().min(2),ideaDescription:z.string().min(10),targetCustomer:z.string().min(2),marketType:z.string().min(2),targetRegion:z.string().min(2),depth:z.enum(["fast","deep"]) });
