import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeLoginId = (value: unknown) =>
  typeof value === "string"
    ? value.trim().toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, "")
    : "";

const validPassword = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 10 &&
  value.length <= 128 &&
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

type ActivationClaim = {
  membership_id: string;
  storefront_id: string;
  synthetic_email: string;
  full_name: string;
  claim_token: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceRoleKey) {
    console.error("business-work-auth: required project environment is unavailable");
    return json({ error: "Work account activation is temporarily unavailable." }, 503);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ error: "A valid activation request is required." }, 400);
  }

  const loginId = normalizeLoginId(input.loginId);
  const activationCode = typeof input.activationCode === "string" ? input.activationCode.trim() : "";
  const password = input.password;
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(loginId) || activationCode.length < 6) {
    return json({ error: "The login ID or activation code is invalid or expired." }, 400);
  }
  if (!validPassword(password)) {
    return json({
      error: "Use 10–128 characters with uppercase, lowercase, number and symbol.",
    }, 400);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: claimRows, error: claimError } = await admin.rpc(
    "claim_business_team_activation",
    { p_login_id: loginId, p_code: activationCode },
  );
  const claim = Array.isArray(claimRows) ? claimRows[0] as ActivationClaim | undefined : undefined;
  if (claimError) {
    console.error("business-work-auth: activation claim failed", claimError.code);
    return json({ error: "Work account activation is temporarily unavailable." }, 503);
  }
  if (!claim) {
    return json({ error: "The login ID or activation code is invalid or expired." }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: claim.synthetic_email,
    password,
    email_confirm: true,
    app_metadata: {
      account_type: "business_employee",
      membership_id: claim.membership_id,
      storefront_id: claim.storefront_id,
    },
    user_metadata: {
      full_name: claim.full_name,
      work_login_id: loginId,
      work_only: true,
    },
  });
  if (createError || !created.user) {
    console.error("business-work-auth: work identity creation failed", createError?.code);
    return json({ error: "This work account could not be activated. Ask the owner to resend the code." }, 409);
  }

  const { error: completeError } = await admin.rpc("complete_business_team_activation", {
    target_member: claim.membership_id,
    target_auth_user: created.user.id,
    p_claim_token: claim.claim_token,
  });
  if (completeError) {
    console.error("business-work-auth: activation completion failed", completeError.code);
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      console.error("business-work-auth: orphan cleanup failed", cleanupError.code);
    }
    return json({ error: "This work account could not be activated. Ask the owner to resend the code." }, 409);
  }

  return json({
    activated: true,
    loginId,
    message: "Password created. The business owner must approve this work account before chat access begins.",
  }, 201);
});
