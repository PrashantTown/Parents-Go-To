"use strict";

// Supabase connection. The publishable key is meant to be public: what each
// visitor can read or change is enforced by the database security rules in
// supabase/migrations. Never put the secret (service_role) key in this file.
window.PTG_CONFIG = {
  supabaseUrl: "https://tgkuiqkxhfqzrqeirppv.supabase.co",
  supabaseKey: "sb_publishable_CZ3aH-t-vIa1wJtX25dQ9Q_PN3jyi3o",
  // Public half of the push-notification key pair (see supabase/README.md).
  // Leave empty until it is set up; alerts then only show while the site is open.
  vapidPublicKey: ""
};
