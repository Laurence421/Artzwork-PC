// Keeps the free Supabase project awake: Supabase pauses a free project after 7 days without
// activity, so once a day this asks the database one tiny question (the shop's name).
// A Netlify scheduled function (free plan); both sites run it, which is harmless.
export default async function keepAlive() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.log("keep-alive: Supabase settings missing");
    return new Response("missing settings", { status: 500 });
  }
  const res = await fetch(`${url}/rest/v1/stores?select=name&limit=1`, { headers: { apikey: key } });
  console.log(`keep-alive: database answered ${res.status}`);
  return new Response(res.ok ? "ok" : "database error", { status: res.ok ? 200 : 502 });
}

export const config = { schedule: "@daily" };
