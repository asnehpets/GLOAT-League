// Supabase Edge Function example for GLOAT announcement email.
// Required secret: RESEND_API_KEY
// Optional secret: GLOAT_FROM_EMAIL (must be a verified sender in Resend)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { post, recipients, league = "GLOAT" } = await req.json();
    if (!post?.title || !post?.body || !Array.isArray(recipients)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("GLOAT_FROM_EMAIL") || "GLOAT League <onboarding@resend.dev>";
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const valid = recipients.filter((r: any) => r?.email);
    const results = [];
    for (const recipient of valid) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [recipient.email],
          subject: `${league}: ${post.title}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>${escapeHtml(post.title)}</h2><p>Hi ${escapeHtml(recipient.firstName || "there")},</p><p style="white-space:pre-wrap">${escapeHtml(post.body)}</p><hr><p style="color:#667;font-size:12px">Sent from the ${escapeHtml(league)} league app.</p></div>`
        })
      });
      results.push({ email: recipient.email, ok: response.ok });
    }
    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

function escapeHtml(value: string) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
