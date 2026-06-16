export function getRequestId(req: Request): string {
  return req.headers.get('x-request-id') || crypto.randomUUID();
}

export function getClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return null;
  // Take first hop
  return xff.split(',')[0]?.trim() || null;
}

export function getUserAgent(req: Request): string | null {
  return req.headers.get('user-agent');
}
