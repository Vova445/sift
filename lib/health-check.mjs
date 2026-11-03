export async function healthCheckResponse(database, now = new Date()) {
  const headers = { 'cache-control': 'no-store, max-age=0' };
  try {
    const result = await database.prepare('SELECT 1 AS healthy').first();
    if (result?.healthy !== 1) throw new Error('database health query returned no row');
    return Response.json({ status: 'ok', checks: { database: 'ok' }, timestamp: now.toISOString() }, { headers });
  } catch {
    console.error(JSON.stringify({ event: 'health_check.failed', check: 'database', timestamp: now.toISOString() }));
    return Response.json({ status: 'degraded', checks: { database: 'unavailable' }, timestamp: now.toISOString() }, { status: 503, headers });
  }
}
