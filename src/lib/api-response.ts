export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

export function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status })
}
