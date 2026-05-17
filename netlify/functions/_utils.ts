export function jsonResponse(statusCode: number, data: unknown) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(data),
  }
}

export function methodNotAllowed(allowed: string[]) {
  return jsonResponse(405, {
    error: `Method not allowed. Use ${allowed.join(', ')}`,
  })
}
