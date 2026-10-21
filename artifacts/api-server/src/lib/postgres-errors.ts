/**
 * Drizzle wraps PostgreSQL errors in `cause`. Check the complete cause chain
 * without relying on driver-specific Error classes or exposing SQL to clients.
 */
export function isPostgresUniqueViolation(error: unknown): boolean {
  const visited = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
