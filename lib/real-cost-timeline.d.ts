export type TimelineFinding = {
  kind: string;
  evidence?: string;
  confidence?: 'high' | 'medium' | 'low';
};
export type TimelineReport = {
  priceDetails?: Array<{
    amount: number | null;
    currency: 'USD' | 'EUR' | 'GBP' | 'UAH' | null;
    cadence: 'monthly' | 'yearly' | 'weekly' | 'quarterly' | 'half-yearly' | null;
    introMonths?: number;
  }>;
  findings?: TimelineFinding[];
  unknowns?: Array<{ kind: string }>;
  lockedCount?: number;
};
export function buildRealCostTimeline(report: TimelineReport, startDate?: Date): {
  currency: string | null;
  total: number | null;
  payments: Array<{ date: string; month: number; amount: number; currency: string }>;
  months: Array<{ month: number; spent: number; cumulative: number }>;
  events: Array<{ kind: string; title: string; date: string | null; month: number | null; detail: string; evidence: string }>;
  notes: string[];
  unavailableReason: string;
  startDate: string;
  endDate: string;
  sourceEvidence: string;
};
