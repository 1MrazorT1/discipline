import { createClient } from "npm:@supabase/supabase-js@2";

type GetPhotoUrlsRequest = {
  object_keys?: string[];
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

  let body: GetPhotoUrlsRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const objectKeys = [...new Set(body.object_keys ?? [])].filter((key) =>
    typeof key === "string" && key.length > 0
  );

  if (objectKeys.length === 0) {
    return jsonResponse({ urls: {} });
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
  const unauthorizedKey = objectKeys.find((key) => !key.startsWith(allowedPrefix));
  if (unauthorizedKey) {
    return jsonResponse({ error: "Unauthorized for one or more object keys." }, 403);
  }

  try {
    const signedEntries = await Promise.all(
      objectKeys.map(async (objectKey) => {
        const { data, error } = await supabase.storage
          .from("meal-photos")
          .createSignedUrl(objectKey, 3600);

        if (error || !data?.signedUrl) {
          throw error ?? new Error(`Could not sign ${objectKey}.`);
        }

        return [objectKey, data.signedUrl] as const;
      }),
    );

    return jsonResponse({ urls: Object.fromEntries(signedEntries) });
  } catch (error) {
    console.error("Batch signed photo URL error:", error);
    return jsonResponse({ error: "Could not create signed photo URLs." }, 500);
  }
});
