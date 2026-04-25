import { supabase } from "./supabase";
import type { Profile } from "@/types/database";

const defaultColor = "#3f9c75";

const cleanName = (value?: string | null) => value?.trim().replace(/\s+/g, " ") || null;

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
  const displayName = cleanName(params.name) ?? metadataName ?? "Me";
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: params.userId,
      name: displayName,
      daily_goal_kcal: 2000,
      color: defaultColor,
      avatar_url: null,
    })
    .select("*")
    .single();

  if (profileError || !profile) {
    throw profileError ?? new Error("Could not create profile.");
  }

  return profile as Profile;
};
