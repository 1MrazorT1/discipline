import { supabase } from "./supabase";

export const analyzeMeal = async (params: {
  objectKey?: string;
  objectKeys?: string[];
  userId: string;
}) => {
  const objectKeys = params.objectKeys ?? (params.objectKey ? [params.objectKey] : []);
  const { data, error } = await supabase.functions.invoke("analyze-meal", {
    body: {
      object_key: objectKeys[0],
      object_keys: objectKeys,
      user_id: params.userId,
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
