export type CancellationKit = {
  providerId: string | null;
  providerName: string;
  language: 'uk' | 'en';
  helpUrl: string | null;
  helpLabel: string | null;
  refundUrl: string | null;
  refundLabel: string | null;
  steps: string[];
  evidence: string[];
  hasLockedEvidence: boolean;
  disclaimer: string;
  sourceNote: string;
  placeholders: string;
  email: { subject: string; body: string };
};
export function cancellationProviderForUrl(url: string): { id: string; name: string; helpUrl: string; helpLabel: string; refundUrl?: string; refundLabel?: string } | null;
export function buildCancellationKit(report: unknown, language?: string): CancellationKit;
