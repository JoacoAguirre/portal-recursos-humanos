import { z } from "zod";

export const onboardingProfileSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  contact_email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(300)
}).strict();

export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;
