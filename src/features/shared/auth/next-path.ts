/** Only same-site paths, so ?next= can't send people to another website. */
export function safeNext(next: unknown): string | null {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : null;
}
