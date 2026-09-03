export function json(data: unknown, init?: number | ResponseInit) {
  const ri: ResponseInit = typeof init === 'number' ? { status: init } : init ?? {};
  return new Response(JSON.stringify(data), {
    ...ri,
    headers: { 'Content-Type': 'application/json', ...(ri.headers ?? {}) },
  });
}

export function bad(message: string, status = 400) {
  return json({ error: message }, status);
}
