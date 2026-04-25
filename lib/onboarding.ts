import { supabase } from "./supabase";
import type { Profile } from "@/types/database";

const defaultColor = "#3f9c75";

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

  const displayName = params.name?.trim() || params.email?.split("@")[0] || "Me";
  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({ name: `${displayName} household`, created_by: params.userId })
    .select("id")
    .single();

  if (householdError || !household) {
    throw householdError ?? new Error("Could not create household.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: params.userId,
      name: displayName,
      daily_goal_kcal: 2000,
      color: defaultColor,
      avatar_url: null,
      household_id: household.id,
    })
    .select("*")
    .single();

  if (profileError || !profile) {
    throw profileError ?? new Error("Could not create profile.");
  }

  return profile as Profile;
};
