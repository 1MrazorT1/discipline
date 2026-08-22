import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { MealAnalysis } from "@/types/database";
import { uploadMealPhotos } from "@/lib/upload";

export const analyzeMeal = async (params: {
  objectKey?: string;
  objectKeys?: string[];
  userId: string;
  note?: string;
  eatenAt?: string;
  mealWeightGrams?: number | null;
}) => {
  const objectKeys = params.objectKeys ?? (params.objectKey ? [params.objectKey] : []);
  const { data, error } = await supabase.functions.invoke("analyze-meal", {
    body: {
      object_key: objectKeys[0],
      object_keys: objectKeys,
      user_id: params.userId,
      note: params.note,
      eaten_at: params.eatenAt,
      meal_weight_grams: params.mealWeightGrams,
    },
  });

  if (error) {
    let message = "Could not analyze meal.";
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const details = await context.json();
        if (typeof details?.error === "string") message = details.error;
      } catch {
        message = `${message} Status ${context.status}.`;
      }
    }

    throw new Error(message);
  }

  return data;
};

export type AnalysisCallbacks = {
  onUpdated: (analysis: MealAnalysis) => void;
  onError: (analysis: MealAnalysis) => void;
};

/**
 * Start an async meal analysis that survives app backgrounding.
 *
 * 1. Creates a `meal_analyses` row with status `pending` (a quick DB write
 *    that completes before the app can be backgrounded).
 * 2. Invokes the `analyze-meal` Edge Function **without awaiting** the result.
 *    The function runs server-side and will update the status column as it
 *    progresses: `processing` → `completed` | `failed`.
 * 3. The caller receives the created `MealAnalysis` record immediately and can
 *    track progress via Realtime (see `subscribeToMealAnalyses`) or by polling.
 */
export const startMealAnalysis = async (params: {
  objectKeys: string[];
  userId: string;
  note?: string;
  eatenAt?: string;
  mealWeightGrams?: number | null;
}): Promise<MealAnalysis> => {
  const {
    data: analysis,
    error: analysisError,
  } = await supabase
    .from("meal_analyses")
    .insert({
      user_id: params.userId,
      object_keys: params.objectKeys,
      note: params.note ?? null,
      meal_weight_grams: params.mealWeightGrams ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (analysisError || !analysis) {
    throw new Error(
      analysisError?.message ?? "Could not create meal analysis record.",
    );
  }

  void supabase.functions.invoke("analyze-meal", {
    body: {
      object_key: params.objectKeys[0],
      object_keys: params.objectKeys,
      user_id: params.userId,
      analysis_id: analysis.id,
      note: params.note,
      eaten_at: params.eatenAt,
      meal_weight_grams: params.mealWeightGrams,
    },
  });

  return analysis as MealAnalysis;
};

/**
 * Subscribe to real-time updates on the `meal_analyses` table for a given user.
 * Call `unsubscribe()` when the component unmounts or the user changes.
 */
export const subscribeToMealAnalyses = (
  userId: string,
  callbacks: AnalysisCallbacks,
): RealtimeChannel => {
  const channel = supabase
    .channel(`public:meal_analyses:user_id=eq.${userId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "meal_analyses",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const updated = payload.new as MealAnalysis;
        if (updated.status === "failed") {
          callbacks.onError(updated);
        } else {
          callbacks.onUpdated(updated);
        }
      },
    )
    .subscribe();

  return channel;
};

/**
 * Fetch all analyses for a user that are still in progress or pending.
 * Used as a fallback when Realtime may have missed updates (e.g. the app
 * was closed entirely and reopened).
 */
export const getPendingAnalyses = async (
  userId: string,
): Promise<MealAnalysis[]> => {
  const { data, error } = await supabase
    .from("meal_analyses")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load pending analyses: ${error.message}`);
  }

  return (data ?? []) as MealAnalysis[];
};

/**
 * Retry a failed or pending meal analysis.
 * Fetches the original analysis record, resets its status to pending,
 * and re-invokes the analyze-meal Edge Function.
 */
export const retryMealAnalysis = async (analysisId: string): Promise<MealAnalysis> => {
  const { data: existing, error: fetchError } = await supabase
    .from("meal_analyses")
    .select("*")
    .eq("id", analysisId)
    .single();

  if (fetchError || !existing) {
    throw new Error("Could not find analysis record to retry.");
  }

  const { error: resetError } = await supabase
    .from("meal_analyses")
    .update({
      status: "pending",
      error: null,
      meal_id: null,
      log: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", analysisId);

  if (resetError) {
    throw new Error("Could not reset analysis status.");
  }

  const updatedAnalysis = { ...(existing as MealAnalysis), status: "pending" as const, error: null, log: null, meal_id: null };

  void supabase.functions.invoke("analyze-meal", {
    body: {
      object_key: existing.object_keys[0],
      object_keys: existing.object_keys,
      user_id: existing.user_id,
      analysis_id: existing.id,
      note: existing.note,
      retry: true,
      meal_weight_grams: existing.meal_weight_grams,
    },
  });

  return updatedAnalysis;
};

export const getSignedPhotoUrl = async (objectKey: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke("get-photo-url", {
    body: {
      object_key: objectKey,
    },
  });

  if (error) {
    let message = "Could not create signed photo URL.";
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const details = await context.json();
        if (typeof details?.error === "string") message = details.error;
      } catch {
        message = `${message} Status ${context.status}.`;
      }
    }

    throw new Error(message);
  }

  const signedUrl = data?.signedUrl ?? data?.signed_url;
  if (typeof signedUrl !== "string") {
    throw new Error("get-photo-url did not return a signed URL.");
  }

  return signedUrl;
};

export const getSignedPhotoUrls = async (
  objectKeys: string[],
): Promise<Record<string, string>> => {
  const uniqueKeys = [...new Set(objectKeys)].filter(Boolean);
  if (uniqueKeys.length === 0) return {};

  const { data, error } = await supabase.functions.invoke("get-photo-urls", {
    body: {
      object_keys: uniqueKeys,
    },
  });

  if (error) {
    let message = "Could not create signed photo URLs.";
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const details = await context.json();
        if (typeof details?.error === "string") message = details.error;
      } catch {
        message = `${message} Status ${context.status}.`;
      }
    }

    throw new Error(message);
  }

  if (!data?.urls || typeof data.urls !== "object") {
    throw new Error("get-photo-urls did not return signed URLs.");
  }

  return data.urls as Record<string, string>;
};

/**
 * Bulk-analyze meal photos by date range (Issue #10).
 *
 * Uploads all provided photo URIs, groups them into individual meals
 * (one photo = one meal, up to 3 photos per meal), and starts an
 * async analysis for each. Meals are distributed evenly across the
 * given date range.
 *
 * Returns a summary of how many analyses were started.
 */
export const bulkAnalyzePhotos = async (params: {
  uris: string[];
  userId: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  note?: string;
  mealWeightGrams?: number | null;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ started: number; failed: number }> => {
  const {
    uris,
    userId,
    startDate,
    endDate,
    note,
    mealWeightGrams,
    onProgress,
  } = params;

  const validUris = uris.filter(Boolean);
  if (validUris.length === 0) {
    return { started: 0, failed: 0 };
  }

  // Split into meal groups of up to 3 photos each
  const mealGroups: string[][] = [];
  for (let i = 0; i < validUris.length; i += 3) {
    mealGroups.push(validUris.slice(i, i + 3));
  }

  const total = mealGroups.length;
  const startDt = new Date(startDate);
  const endDt = new Date(endDate);
  const daysCount = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  let started = 0;
  let failed = 0;

  for (let i = 0; i < mealGroups.length; i++) {
    onProgress?.(i + 1, total);

    try {
      // Distribute meals evenly across the date range
      const dayOffset = Math.floor((i / total) * daysCount);
      const mealDate = new Date(startDt);
      mealDate.setDate(mealDate.getDate() + dayOffset);

      const objectKeys = await uploadMealPhotos(mealGroups[i]);
      await startMealAnalysis({
        objectKeys,
        userId,
        note: note || undefined,
        eatenAt: mealDate.toISOString(),
        mealWeightGrams: params.mealWeightGrams,
      });
      started++;
    } catch {
      failed++;
    }
  }

  onProgress?.(total, total);
  return { started, failed };
};
