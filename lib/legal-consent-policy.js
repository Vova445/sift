export const LEGAL_POLICY_VERSIONS = Object.freeze({
  privacy: '1.0.0',
  terms: '1.0.0',
  refund: '1.0.0',
});

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function signupLegalConsent(value) {
  const input = record(value);
  if (input?.acceptTerms !== true || input?.acknowledgePrivacy !== true) return null;
  return { acceptTerms: true, acknowledgePrivacy: true };
}

export function checkoutLegalConsent(value) {
  const input = record(value);
  if (
    input?.acceptTerms !== true ||
    input?.acknowledgePrivacy !== true ||
    input?.acceptRefund !== true ||
    input?.requestImmediatePerformance !== true
  ) return null;
  return {
    acceptTerms: true,
    acknowledgePrivacy: true,
    acceptRefund: true,
    requestImmediatePerformance: true,
  };
}
