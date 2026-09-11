/** `%`/`_`/`\` in a user's query are literals, not wildcards. Postgres LIKE
 *  treats backslash as the escape character by default. */
export const containsPattern = (q: string) =>
  `%${q.replace(/[\\%_]/g, "\\$&")}%`;
