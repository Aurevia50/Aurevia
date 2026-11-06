import {z} from 'zod';

export const waitlistStatuses = ['WAITING','INVITED','REGISTERED','REMOVED'] as const;
export type WaitlistStatus = typeof waitlistStatuses[number];

export function normalizeWaitlistEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const waitlistSubmissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(normalizeWaitlistEmail),
  country: z.string().trim().min(2).max(80),
  investorType: z.enum(['INDIVIDUAL','INSTITUTIONAL','PROFESSIONAL','OTHER']).default('INDIVIDUAL'),
  phone: z.string().trim().max(40).optional().transform(value => value || undefined),
  consent: z.boolean().refine(value => value === true),
  source: z.string().trim().max(80).optional(),
});

export const waitlistStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(waitlistStatuses),
  notes: z.string().trim().max(2000).optional(),
});

export function waitlistStatusLabel(status: WaitlistStatus): string {
  return status.charAt(0)+status.slice(1).toLowerCase();
}
