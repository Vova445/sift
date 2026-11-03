export type AnalyzerFinding = {
  kind: 'renewal' | 'refund' | 'cancellation' | 'trial' | 'price' | 'warning';
  title: string;
  summary: string;
  evidence: string;
  severity: 'good' | 'medium' | 'high';
};

export function evaluateClarity(findings: AnalyzerFinding[], prices: string[]): {
  score: number;
  decision: 'buy' | 'wait' | 'close';
  verdict: string;
};
export function cleanPageHtml(html: string): string;
export function extractPurchaseTerms(text: string): { findings: AnalyzerFinding[]; prices: string[] };
