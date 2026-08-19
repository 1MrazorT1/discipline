import { createClient } from "npm:@supabase/supabase-js@2";

type AnalyzeMealRequest = {
  object_key?: string;
  object_keys?: string[];
  user_id?: string;
  analysis_id?: string;
  note?: string;
};

type MealAnalysis = {
  meal_name: string;
  items: Array<{
    name: string;
    estimated_grams: number | null;
    estimated_kcal: number;
    kcal_per_100g: number | null;
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

const computeEstimatedGrams = (
  kcal: number,
  kcalPer100g: number | null,
): number | null => {
  if (kcalPer100g === null || kcalPer100g <= 0) return null;
  return Math.round((kcal * 100) / kcalPer100g);
};

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
        (item.estimated_grams != null && typeof item.estimated_grams !== "number") ||
        (item.kcal_per_100g != null && typeof item.kcal_per_100g !== "number")
      ) {
        throw new Error("NVIDIA response contained an invalid meal item.");
      }

      const roundedKcal = Math.round(item.estimated_kcal);
      return {
        name: item.name,
        estimated_grams:
          item.estimated_grams ?? computeEstimatedGrams(roundedKcal, item.kcal_per_100g ?? null),
        estimated_kcal: roundedKcal,
        kcal_per_100g: item.kcal_per_100g ?? null,
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

  const objectKeys = [
    ...new Set(
      (Array.isArray(body.object_keys) ? body.object_keys : [body.object_key])
        .filter((key): key is string => typeof key === "string" && key.length > 0),
    ),
  ].slice(0, 3);
  const { user_id, analysis_id, note } = body;

  if (objectKeys.length === 0 || !user_id) {
    return jsonResponse(
      { error: "Missing required fields: object_keys, user_id." },
      400,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const updateAnalysisStatus = async (
    status: "processing" | "completed" | "failed",
    updates: { meal_id?: string; error?: string } = {},
  ) => {
    if (!analysis_id) return;
    const setClause: Record<string, unknown> = { status };
    if (updates.meal_id !== undefined) setClause.meal_id = updates.meal_id;
    if (updates.error !== undefined) setClause.error = updates.error;

    try {
      await supabase
        .from("meal_analyses")
        .update(setClause)
        .eq("id", analysis_id)
        .eq("user_id", user_id);
    } catch (updateError) {
      console.error("Failed to update analysis status:", updateError);
    }
  };

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

    const allowedPrefix = `meals/${user_id}/`;
    if (objectKeys.some((objectKey) => !objectKey.startsWith(allowedPrefix))) {
      return jsonResponse({ error: "Unauthorized for requested object key." }, 403);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return jsonResponse(
        { error: "Profile does not exist for requested user." },
        403,
      );
    }

    // Mark analysis as processing (if tracking is enabled)
    await updateAnalysisStatus("processing");

    const signedPhotoUrls = [];
    for (const objectKey of objectKeys) {
      const { data: signedPhoto, error: signedPhotoError } = await supabase.storage
        .from("meal-photos")
        .createSignedUrl(objectKey, 300);

      if (signedPhotoError || !signedPhoto?.signedUrl) {
        console.error("Signed photo URL error:", signedPhotoError);
        await updateAnalysisStatus("failed", {
          error: "Could not create signed photo URL.",
        });
        return jsonResponse({ error: "Could not create signed photo URL." }, 500);
      }

      signedPhotoUrls.push(signedPhoto.signedUrl);
    }

    const promptParts = [
      "Analyze these meal photos for a calorie tracking app called Discipline.",
      "The photos may show the same meal from different angles or close-ups.",
      "Return ONLY valid JSON with this exact shape:",
      '{"meal_name":"string","items":[{"name":"string","estimated_grams":number,"estimated_kcal":number,"kcal_per_100g":number|null}],"total_kcal":number,"confidence":"low|medium|high"}',
      "Use null for estimated_grams only when a gram estimate is not possible.",
      "kcal_per_100g is the calories per 100g of the ingredient (e.g. 165 for chicken breast).",
      "Provide kcal_per_100g from your nutritional knowledge even when estimated_grams is null.",
      "Use null for kcal_per_100g only when the food is completely unrecognizable.",
      "Do not include markdown, comments, explanations, or extra keys.",
    ];

    if (note && note.trim()) {
      promptParts.push(`Additional context from the user: ${note.trim()}`);
    }

    const prompt = promptParts.join("\n");

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
                ...signedPhotoUrls.map((signedUrl) => ({
                  type: "image_url",
                  image_url: { url: signedUrl },
                })),
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
      await updateAnalysisStatus("failed", {
        error: `NVIDIA API returned ${nvidiaResponse.status}.`,
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
      await updateAnalysisStatus("failed", {
        error: "NVIDIA returned no text content.",
      });
      return jsonResponse(
        { error: "Meal analysis failed.", details: "NVIDIA returned no text content." },
        502,
      );
    }

    const analysis = parseMealAnalysis(content);

    const { data: meal, error: mealError } = await supabase
      .from("meals")
      .insert({
        photo_url: objectKeys[0],
        total_kcal: analysis.total_kcal,
        confidence: analysis.confidence,
        meal_name: analysis.meal_name,
        user_id,
      })
      .select()
      .single();

    if (mealError || !meal) {
      console.error("Meal insert error:", mealError);
      await updateAnalysisStatus("failed", {
        error: "Could not create meal.",
      });
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
          kcal_per_100g: item.kcal_per_100g,
        })),
      )
      .select();

    if (itemsError || !items) {
      console.error("Meal items insert error:", itemsError);
      await supabase.from("meals").delete().eq("id", meal.id);
      await updateAnalysisStatus("failed", {
        error: "Could not create meal items.",
      });
      return jsonResponse({ error: "Could not create meal items." }, 500);
    }

    // Mark analysis as completed with the created meal_id
    await updateAnalysisStatus("completed", { meal_id: meal.id });

    return jsonResponse({ meal: { ...meal, items } });
  } catch (error) {
    console.error("Unexpected analyze-meal error:", error);
    await updateAnalysisStatus("failed", {
      error: error instanceof Error ? error.message : "Unexpected error.",
    });
    return jsonResponse(
      { error: "Unexpected error while analyzing meal." },
      500,
    );
  }
});
