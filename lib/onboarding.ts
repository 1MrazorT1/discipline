import { supabase } from "./supabase";
import type { Profile } from "@/types/database";

const defaultColor = "#3f9c75";

const cleanName = (value?: string | null) => value?.trim().replace(/\s+/g, " ") || null;

/**
 * Derive a display name from an email address by taking the part
 * before the @ and capitalizing it (e.g. "john.doe@example.com" → "John").
 */
const nameFromEmail = (email?: string | null): string | null => {
  if (!email) return null;
  const local = email.split("@")[0];
  if (!local) return null;
  const capitalized = local
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
  return capitalized || null;
};

export const ensureProfile = async (params: {
  userId: string;
  email?: string | null;
  name?: string | null;
}) => {
  const { data: existingProfile, error: existingError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.userId)
    .maybeSingle();

  if (existingProfile) {
    return existingProfile as Profile;
  }

  if (existingError) {
    throw existingError;
  }

  const { data: authData } = await supabase.auth.getUser();
  const metadataName =
    cleanName(authData.user?.user_metadata?.full_name) ??
    cleanName(authData.user?.user_metadata?.name);
  const displayName =
    cleanName(params.name) ?? metadataName ?? nameFromEmail(params.email) ?? "Me";
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: params.userId,
      name: displayName,
      daily_goal_kcal: 2000,
      color: defaultColor,
      avatar_url: null,
      effective_date: new Date().toISOString().split("T")[0],
    })
    .select("*")
    .single();

  if (profileError || !profile) {
    throw profileError ?? new Error("Could not create profile.");
  }

  return profile as Profile;
};
