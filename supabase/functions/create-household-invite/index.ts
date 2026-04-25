import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const createCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length];
  }
  return code;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse({ error: "Server is missing required configuration." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "Missing bearer token." }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, household_id")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile?.household_id) {
    return jsonResponse({ error: "Profile is missing a household." }, 400);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: invite, error: inviteError } = await supabase
      .from("household_invites")
      .insert({
        household_id: profile.household_id,
        created_by: authData.user.id,
        code,
        expires_at: expiresAt,
      })
      .select("code, expires_at")
      .single();

    if (!inviteError && invite) {
      return jsonResponse(invite);
    }

    if (inviteError?.code !== "23505") {
      console.error("Create invite error:", inviteError);
      return jsonResponse({ error: "Could not create invite code." }, 500);
    }
  }

  return jsonResponse({ error: "Could not create a unique invite code." }, 500);
});
