/** Fixed-window limiter in Postgres — serverless instances share no memory. */
export async function consumeRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ count: number }>(
    `insert into rate_limits (bucket, count, window_start)
     values ($1, 1, now())
     on conflict (bucket) do update set
       count = case
         when rate_limits.window_start < now() - ($2::int * interval '1 second')
         then 1 else rate_limits.count + 1 end,
       window_start = case
         when rate_limits.window_start < now() - ($2::int * interval '1 second')
         then now() else rate_limits.window_start end
     returning count`,
    [bucket, windowSeconds],
  );
  return Number(rows[0]?.count ?? 0) <= limit;
}

export async function requireRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
  message: string,
): Promise<void> {
  if (!(await consumeRateLimit(bucket, limit, windowSeconds))) {
    throw new Error(message);
  }
}
