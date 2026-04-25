import { createClient } from "npm:@supabase/supabase-js@2";

type UploadUrlRequest = {
  file_ext?: string;
  content_type?: string;
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

const safeExtension = (extension: string | undefined) => {
  const cleaned = extension?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return cleaned === "jpeg" ? "jpg" : cleaned;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(
      { error: "Server is missing required upload configuration." },
      500,
    );
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "Missing bearer token." }, 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  let body: UploadUrlRequest;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const fileExt = safeExtension(body.file_ext);
  const objectPath = `meals/${authData.user.id}/${crypto.randomUUID()}.${fileExt}`;

  try {
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await serviceClient.storage
      .from("meal-photos")
      .createSignedUploadUrl(objectPath);

    if (error || !data?.signedUrl) {
      console.error("Signed upload URL error:", error);
      return jsonResponse({ error: "Could not create signed upload URL." }, 500);
    }

    return jsonResponse({
      uploadUrl: data.signedUrl,
      objectKey: objectPath,
    });
  } catch (error) {
    console.error("Unexpected upload URL error:", error);
    return jsonResponse({ error: "Unexpected error while creating upload URL." }, 500);
  }
});
