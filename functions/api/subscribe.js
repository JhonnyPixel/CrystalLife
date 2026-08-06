/**
 * Cloudflare Pages Function / Worker API Endpoint
 * Path: /api/subscribe
 * 
 * Handles POST requests containing { "email": "user@example.com" }
 * Stores subscribers in Cloudflare D1 Database (or KV storage)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const data = await request.json();
    const email = data.email?.trim().toLowerCase();

    // Basic email validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Indirizzo email non valido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timestamp = new Date().toISOString();
    const userAgent = request.headers.get("user-agent") || "unknown";
    const ip = request.headers.get("cf-connecting-ip") || "unknown";

    // 1. Storage via Cloudflare D1 Database (if DB binding exists)
    if (env && env.DB) {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS waitlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          created_at TEXT NOT NULL,
          user_agent TEXT,
          ip TEXT
        )`
      ).run();

      await env.DB.prepare(
        `INSERT INTO waitlist (email, created_at, user_agent, ip) 
         VALUES (?, ?, ?, ?) 
         ON CONFLICT(email) DO UPDATE SET created_at = excluded.created_at`
      ).bind(email, timestamp, userAgent, ip).run();
    }
    // 2. Storage via Cloudflare KV (if WAITLIST_KV binding exists)
    else if (env && env.WAITLIST_KV) {
      await env.WAITLIST_KV.put(`email:${email}`, JSON.stringify({ email, timestamp, ip }));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Iscrizione completata con successo! Ti avviseremo al lancio di Shard.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Subscription Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Errore durante l'iscrizione. Riprova tra poco." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
