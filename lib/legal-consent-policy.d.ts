export const LEGAL_POLICY_VERSIONS: Readonly<{ privacy: string; terms: string; refund: string }>;
export type SignupLegalConsent = { acceptTerms: true; acknowledgePrivacy: true };
export type CheckoutLegalConsent = SignupLegalConsent & { acceptRefund: true; requestImmediatePerformance: true };
export function signupLegalConsent(value: unknown): SignupLegalConsent | null;
export function checkoutLegalConsent(value: unknown): CheckoutLegalConsent | null;
