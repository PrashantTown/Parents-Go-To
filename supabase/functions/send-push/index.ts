// Sends a push notification to every device a person has allowed, whenever
// a row is added to the notifications table.
//
// Called by a Database Webhook (see supabase/README.md). Settings, added
// under Edge Functions -> Secrets:
//   WEBHOOK_SECRET     the same text used by the notify-email webhooks
//   VAPID_PUBLIC_KEY   from `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY  from the same command (keep this one secret)
//   VAPID_CONTACT      e.g. mailto:hello@yourdomain.com.au
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (name: string) => Deno.env.get(name) ?? "";

webpush.setVapidDetails(env("VAPID_CONTACT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET") || !env("WEBHOOK_SECRET")) {
    return new Response("Not allowed", { status: 401 });
  }
  const payload = await req.json();
  const n = payload?.record;
  if (payload?.type !== "INSERT" || payload?.table !== "notifications" || !n?.recipient_id) {
    return new Response("ignored");
  }
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", n.recipient_id);
  if (error) {
    console.error(error);
    return new Response(error.message, { status: 500 });
  }
  const message = JSON.stringify({
    title: n.title,
    body: n.body,
    go: n.go,
    tag: n.tag || n.kind,
  });
  const gone: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message,
        { TTL: 60 * 60 * 24 },
      );
    } catch (err) {
      // 404 or 410: the browser no longer accepts pushes for this device.
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        gone.push(s.id);
      } else {
        console.error(err);
      }
    }
  }));
  if (gone.length) {
    await admin.from("push_subscriptions").delete().in("id", gone);
  }
  return new Response("ok");
});
