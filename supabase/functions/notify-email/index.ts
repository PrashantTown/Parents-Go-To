// Sends emails when rows are added to the database:
//   support_tickets -> tells the team about a new contact message or report
//   family_members  -> invites the carer by email
//
// Called by two Database Webhooks (see supabase/README.md). Settings, added
// under Edge Functions -> Secrets:
//   WEBHOOK_SECRET  any long random text; the webhooks send it as a header
//   RESEND_API_KEY  from resend.com
//   FROM_EMAIL      e.g. "Parents Go To <hello@yourdomain.com.au>"
//   TEAM_EMAIL      where contact messages should go
//   SITE_URL        e.g. https://yourdomain.com.au/reading-for-pleasure.html

type Payload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
};

const env = (name: string) => Deno.env.get(name) ?? "";

function escapeHtml(text: unknown): string {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}

async function send(to: string, subject: string, text: string, replyTo?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env("FROM_EMAIL"),
      to: [to],
      subject,
      text,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">${
        escapeHtml(text).replace(/\n/g, "<br>")
      }</div>`,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend refused the email: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET") || !env("WEBHOOK_SECRET")) {
    return new Response("Not allowed", { status: 401 });
  }
  const payload = (await req.json()) as Payload;
  const r = payload.record ?? {};
  const site = env("SITE_URL");
  try {
    if (payload.type === "INSERT" && payload.table === "support_tickets") {
      const from = String(r.email ?? "");
      await send(
        env("TEAM_EMAIL"),
        `New message ${r.ref} — ${r.area || "Contact form"}`,
        `From: ${r.name || "(no name)"} <${from}>\n` +
          `Reference: ${r.ref}\nAbout: ${r.area || "-"}\n` +
          (r.severity_text ? `Urgency: ${r.severity_text}\n` : "") +
          `\n${r.body}\n\n` +
          `Reply to this email to answer them. Open the admin console to mark it done:\n${site}#admin`,
        from,
      );
    } else if (payload.type === "INSERT" && payload.table === "family_members") {
      const who = String(r.by_name || "A parent");
      await send(
        String(r.email),
        `${who} invited you to their family reading shelf`,
        `Hello ${r.name || "there"},\n\n` +
          `${who} has invited you to see their family reading shelf on Parents Go To.\n\n` +
          `To accept, sign in or create an account with this email address (${r.email}):\n` +
          `${site}#signin\n\n` +
          `You will be asked to accept the invitation once you are signed in. ` +
          `Your invitation code is ${r.ref}.\n\n` +
          `If you were not expecting this, you can ignore this email.`,
      );
    }
    return new Response("ok");
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
