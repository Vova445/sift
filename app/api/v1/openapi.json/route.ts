const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Sift Public API',
    version: '1.0.0',
    description: 'Analyze a public pricing, checkout, or terms page with the same Sift analyzer and Pro account limits as the web app. Requires an active, email-verified Sift Pro account.',
  },
  servers: [{ url: 'https://sift-app.reviewradar-vova445.workers.dev' }],
  security: [{ BearerApiKey: [] }],
  paths: {
    '/api/v1/analyze': {
      post: {
        operationId: 'analyzePurchaseTerms',
        summary: 'Analyze a public purchase or subscription page',
        security: [{ BearerApiKey: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri', maxLength: 2048, description: 'Public HTTP(S) URL to analyze. Private and local network targets are blocked.' } } } } } },
        responses: {
          '200': { description: 'A saved Sift report with clarity score, verdict, prices, evidence, confidence, and source URLs.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Report' } } } },
          '400': { description: 'Invalid JSON or URL field.' },
          '401': { description: 'Missing, invalid, or revoked API key.' },
          '403': { description: 'Email verification or active Sift Pro is required.' },
          '413': { description: 'Request body exceeds 8 KiB.' },
          '422': { description: 'The page is inaccessible, unsupported, ambiguous, or unsafe to fetch.' },
          '429': { description: 'Pro rate limit exceeded. Retry-After is returned.', headers: { 'Retry-After': { schema: { type: 'integer' } } } },
          '502': { description: 'The target site could not be fetched or returned an upstream error.' },
          '503': { description: 'A required Sift service is temporarily unavailable.' },
          '504': { description: 'The target site did not respond within the request timeout.' },
        },
      },
    },
  },
  components: {
    securitySchemes: { BearerApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'Sift API key' } },
    schemas: {
      Report: {
        type: 'object', required: ['id', 'url', 'score', 'decision', 'verdict', 'prices', 'findings', 'unknowns'],
        properties: {
          id: { type: 'string' }, url: { type: 'string', format: 'uri' }, host: { type: 'string' }, title: { type: 'string' }, checkedAt: { type: 'string', format: 'date-time' },
          score: { type: 'integer', minimum: 0, maximum: 100 }, decision: { type: 'string', enum: ['buy', 'wait', 'close'] }, verdict: { type: 'string' }, prices: { type: 'array', items: { type: 'string' } },
          findings: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, sourceUrl: { type: 'string', format: 'uri' } } } },
          unknowns: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, confidence: { type: 'string', const: 'low' }, summary: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' } } } },
        },
      },
    },
  },
};

export async function GET() { return Response.json(spec, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } }); }
