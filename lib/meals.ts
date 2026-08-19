import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { MealAnalysis } from "@/types/database";

export const analyzeMeal = async (params: {
  objectKey?: string;
  objectKeys?: string[];
  userId: string;
  note?: string;
}) => {
  const objectKeys = params.objectKeys ?? (params.objectKey ? [params.objectKey] : []);
  const { data, error } = await supabase.functions.invoke("analyze-meal", {
    body: {
      object_key: objectKeys[0],
      object_keys: objectKeys,
      user_id: params.userId,
      note: params.note,
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
      status: "pending",
    })
    .select()
    .single();

  if (analysisError || !analysis) {
    throw new Error(
      analysisError?.message ?? "Could not create meal analysis record.",
    );
  }

  // Fire the Edge Function. We deliberately do NOT await this — the function
  // runs server-side and will update the analysis row regardless of whether
  // the client stays connected. The client tracks progress via Realtime.
  void supabase.functions.invoke("analyze-meal", {
    body: {
      object_key: params.objectKeys[0],
      object_keys: params.objectKeys,
      user_id: params.userId,
      analysis_id: analysis.id,
      note: params.note,
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
