export type AnalyzerFinding = {
  kind: 'renewal' | 'refund' | 'cancellation' | 'trial' | 'price' | 'penalty' | 'warning';
  title: string;
  summary: string;
  evidence: string;
  severity: 'good' | 'medium' | 'high';
  confidence?: 'high' | 'medium' | 'low';
  sourceUrl?: string;
};
export type UnresolvedCondition = { kind: string; title: string; confidence: 'low'; summary: string; evidence: ''; sourceUrl: string; unresolved: true };

export function evaluateClarity(findings: AnalyzerFinding[], prices: string[]): {
  score: number;
  decision: 'buy' | 'wait' | 'close';
  verdict: string;
};
export function cleanPageHtml(html: string): string;
export type AnnualPriceDetail = { amount: number | null; currency: 'USD' | 'EUR' | 'GBP' | 'UAH' | null; cadence: 'monthly' | 'yearly' | 'weekly' | 'quarterly' | 'half-yearly' | null; annualAmount: number | null; firstYearAmount: number | null; introMonths: number };
export function extractPurchaseTerms(text: string): { findings: AnalyzerFinding[]; prices: string[]; priceDetails: AnnualPriceDetail[] };
export function unresolvedConditions(findings: AnalyzerFinding[], prices: string[], priceDetails: AnnualPriceDetail[], sourceUrl: string): UnresolvedCondition[];
