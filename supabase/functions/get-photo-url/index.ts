import { createClient } from "npm:@supabase/supabase-js@2";

type GetPhotoUrlRequest = {
  object_key?: string;
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
    return jsonResponse(
      { error: "Server is missing required photo URL configuration." },
      500,
    );
  }

  let body: GetPhotoUrlRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const { object_key } = body;
  if (!object_key) {
    return jsonResponse({ error: "Missing required field: object_key." }, 400);
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

  const allowedPrefix = `meals/${authData.user.id}/`;
  if (!object_key.startsWith(allowedPrefix)) {
    return jsonResponse({ error: "Unauthorized for requested object key." }, 403);
  }

  try {
    const { data, error } = await supabase.storage
      .from("meal-photos")
      .createSignedUrl(object_key, 3600);

    if (error || !data?.signedUrl) {
      console.error("Signed photo URL error:", error);
      return jsonResponse({ error: "Could not create signed photo URL." }, 500);
    }

    return jsonResponse({ signedUrl: data.signedUrl });
  } catch (error) {
    console.error("Unexpected signed photo URL error:", error);
    return jsonResponse(
      { error: "Unexpected error while creating signed photo URL." },
      500,
    );
  }
});
