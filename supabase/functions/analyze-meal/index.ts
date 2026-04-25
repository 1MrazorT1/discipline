import { createClient } from "npm:@supabase/supabase-js@2";

type AnalyzeMealRequest = {
  object_key?: string;
  user_id?: string;
  household_id?: string;
};

type MealAnalysis = {
  meal_name: string;
  items: Array<{
    name: string;
    estimated_grams: number | null;
    estimated_kcal: number;
  }>;
  total_kcal: number;
  confidence: "low" | "medium" | "high";
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

const parseMealAnalysis = (content: string): MealAnalysis => {
  const jsonText = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(jsonText) as Partial<MealAnalysis>;

  if (
    typeof parsed.meal_name !== "string" ||
    !Array.isArray(parsed.items) ||
    typeof parsed.total_kcal !== "number" ||
    !["low", "medium", "high"].includes(String(parsed.confidence))
  ) {
    throw new Error("NVIDIA response did not match the expected meal analysis schema.");
  }

  return {
    meal_name: parsed.meal_name,
    items: parsed.items.map((item) => {
      if (
        typeof item?.name !== "string" ||
        typeof item?.estimated_kcal !== "number" ||
        (item.estimated_grams !== null && typeof item.estimated_grams !== "number")
      ) {
        throw new Error("NVIDIA response contained an invalid meal item.");
      }

      return {
        name: item.name,
        estimated_grams: item.estimated_grams ?? null,
        estimated_kcal: Math.round(item.estimated_kcal),
      };
    }),
    total_kcal: Math.round(parsed.total_kcal),
    confidence: parsed.confidence as MealAnalysis["confidence"],
  };
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
  const nvidiaApiKey = Deno.env.get("NVIDIA_API_KEY");
  const nvidiaModel = Deno.env.get("NVIDIA_MODEL") ??
    "meta/llama-4-maverick-17b-128e-instruct";

  if (!supabaseUrl || !supabaseServiceRoleKey || !nvidiaApiKey) {
    return jsonResponse(
      { error: "Server is missing required environment configuration." },
      500,
    );
  }

  let body: AnalyzeMealRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const { object_key, user_id, household_id } = body;
  if (!object_key || !user_id || !household_id) {
    return jsonResponse(
      { error: "Missing required fields: object_key, user_id, household_id." },
      400,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return jsonResponse({ error: "Missing bearer token." }, 401);
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || authData.user?.id !== user_id) {
      return jsonResponse({ error: "Unauthorized for requested user_id." }, 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, household_id")
      .eq("id", user_id)
      .eq("household_id", household_id)
      .single();

    if (profileError || !profile) {
      return jsonResponse(
        { error: "User does not belong to the requested household." },
        403,
      );
    }

    const { data: signedPhoto, error: signedPhotoError } = await supabase.storage
      .from("meal-photos")
      .createSignedUrl(object_key, 300);

    if (signedPhotoError || !signedPhoto?.signedUrl) {
      console.error("Signed photo URL error:", signedPhotoError);
      return jsonResponse({ error: "Could not create signed photo URL." }, 500);
    }

    const prompt = [
      "Analyze this meal photo for a calorie tracking app called Discipline.",
      "Return ONLY valid JSON with this exact shape:",
      '{"meal_name":"string","items":[{"name":"string","estimated_grams":number,"estimated_kcal":number}],"total_kcal":number,"confidence":"low|medium|high"}',
      "Use null for estimated_grams only when a gram estimate is not possible.",
      "Do not include markdown, comments, explanations, or extra keys.",
    ].join("\n");

    const nvidiaResponse = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nvidiaApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: nvidiaModel,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: signedPhoto.signedUrl } },
              ],
            },
          ],
          temperature: 0.2,
          max_tokens: 1024,
        }),
      },
    );

    if (!nvidiaResponse.ok) {
      const nvidiaErrorBody = await nvidiaResponse.text();
      console.error("NVIDIA API error:", {
        status: nvidiaResponse.status,
        body: nvidiaErrorBody,
      });
      return jsonResponse(
        {
          error: "Meal analysis failed.",
          details: `NVIDIA API returned ${nvidiaResponse.status}.`,
        },
        502,
      );
    }

    const nvidiaPayload = await nvidiaResponse.json();
    const content = nvidiaPayload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return jsonResponse(
        { error: "Meal analysis failed.", details: "NVIDIA returned no text content." },
        502,
      );
    }

    const analysis = parseMealAnalysis(content);

    const { data: meal, error: mealError } = await supabase
      .from("meals")
      .insert({
        photo_url: object_key,
        total_kcal: analysis.total_kcal,
        confidence: analysis.confidence,
        meal_name: analysis.meal_name,
        user_id,
        household_id,
      })
      .select()
      .single();

    if (mealError || !meal) {
      console.error("Meal insert error:", mealError);
      return jsonResponse({ error: "Could not create meal." }, 500);
    }

    const { data: items, error: itemsError } = await supabase
      .from("meal_items")
      .insert(
        analysis.items.map((item) => ({
          meal_id: meal.id,
          name: item.name,
          estimated_grams: item.estimated_grams,
          estimated_kcal: item.estimated_kcal,
        })),
      )
      .select();

    if (itemsError || !items) {
      console.error("Meal items insert error:", itemsError);
      await supabase.from("meals").delete().eq("id", meal.id);
      return jsonResponse({ error: "Could not create meal items." }, 500);
    }

    return jsonResponse({ meal: { ...meal, items } });
  } catch (error) {
    console.error("Unexpected analyze-meal error:", error);
    return jsonResponse(
      { error: "Unexpected error while analyzing meal." },
      500,
    );
  }
});
