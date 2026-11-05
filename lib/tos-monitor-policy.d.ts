export type PurchaseSnapshot = {
  version: 1;
  title: string;
  url: string;
  prices: Array<{ key: string; label: string }>;
  renewal: { present: boolean; cadence: string | null; evidence: string };
  refund: { present: boolean; nonRefundable: boolean; window: { days: number; business: boolean } | null; evidence: string };
};
export type PurchaseTermChange = {
  key: 'price' | 'renewal' | 'refund';
  label: string;
  before: string;
  after: string;
  explanation: string;
  beforeEvidence: string;
  afterEvidence: string;
};
export function purchaseSnapshot(report: unknown): PurchaseSnapshot;
export function diffPurchaseSnapshots(before: PurchaseSnapshot, after: PurchaseSnapshot): PurchaseTermChange[];
