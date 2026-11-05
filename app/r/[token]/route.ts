const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const destination = new URL('/', req.url);
  if (tokenPattern.test(token)) destination.searchParams.set('ref', token);
  return Response.redirect(destination, 307);
}
