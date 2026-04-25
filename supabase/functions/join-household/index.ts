import { createClient } from "npm:@supabase/supabase-js@2";

type JoinHouseholdRequest = {
  code?: string;
};

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

  let body: JoinHouseholdRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const code = body.code?.trim().toUpperCase();
  if (!code) {
    return jsonResponse({ error: "Missing required field: code." }, 400);
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

  const { data: invite, error: inviteError } = await supabase
    .from("household_invites")
    .select("household_id, expires_at")
    .eq("code", code)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (inviteError || !invite) {
    return jsonResponse({ error: "Invite code is invalid or expired." }, 404);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Join profile lookup error:", profileError);
    return jsonResponse({ error: "Could not load profile." }, 500);
  }

  const updatePayload = {
    household_id: invite.household_id,
    updated_at: new Date().toISOString(),
  };

  if (profile) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", authData.user.id);

    if (updateError) {
      console.error("Join household update error:", updateError);
      return jsonResponse({ error: "Could not join household." }, 500);
    }
  } else {
    const displayName = authData.user.email?.split("@")[0] ?? "Member";
    const { error: insertError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      name: displayName,
      daily_goal_kcal: 2000,
      color: "#3f9c75",
      avatar_url: null,
      ...updatePayload,
    });

    if (insertError) {
      console.error("Join household insert error:", insertError);
      return jsonResponse({ error: "Could not create profile." }, 500);
    }
  }

  return jsonResponse({ household_id: invite.household_id });
});
