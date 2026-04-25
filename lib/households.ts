import { supabase } from "./supabase";

const edgeErrorMessage = async (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "context" in error) {
    const context = error.context;
    if (context instanceof Response) {
      try {
        const details = await context.json();
        if (typeof details?.error === "string") return details.error;
      } catch {
        return `${fallback} Status ${context.status}.`;
      }
    }
  }

  return error instanceof Error ? error.message : fallback;
};

export const createHouseholdInvite = async () => {
  const { data, error } = await supabase.functions.invoke("create-household-invite", {
    body: {},
  });

  if (error) {
    throw new Error(await edgeErrorMessage(error, "Could not create invite code."));
  }

  if (typeof data?.code !== "string") {
    throw new Error("Invite function did not return a code.");
  }

  return {
    code: data.code as string,
    expiresAt: data.expires_at as string | undefined,
  };
};

export const joinHousehold = async (code: string) => {
  const { data, error } = await supabase.functions.invoke("join-household", {
    body: {
      code,
    },
  });

  if (error) {
    throw new Error(await edgeErrorMessage(error, "Could not join household."));
  }

  if (typeof data?.household_id !== "string") {
    throw new Error("Join function did not return a household.");
  }

  return data.household_id as string;
};
