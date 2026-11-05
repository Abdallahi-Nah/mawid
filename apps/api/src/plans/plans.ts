import type { PlanLimits } from '@mawid/shared';
import type { Plan } from '@prisma/client';

/** AI messages allowed = AI_MONTHLY_QUOTA x this factor. */
export const PLAN_AI_FACTOR: Record<Plan, number> = { FREE: 1, PRO: 10, BUSINESS: 50 };

/** null = no limit. The "Free" and "Pro" plans of the SRS; BUSINESS is the unlimited one. */
const BASE: Record<Plan, { staff: number | null; bookingsPerMonth: number | null }> = {
  FREE: { staff: 2, bookingsPerMonth: 50 },
  PRO: { staff: 10, bookingsPerMonth: 1000 },
  BUSINESS: { staff: null, bookingsPerMonth: null },
};

export function limitsFor(plan: Plan, aiMonthlyQuota: number): PlanLimits {
  return { ...BASE[plan], aiMessagesPerMonth: aiMonthlyQuota * PLAN_AI_FACTOR[plan] };
}
