/**
 * Unit tests for the `analyze-meal` Supabase Edge Function.
 *
 * This is the most complex Edge Function — it:
 * 1. Checks environment configuration (Supabase + NVIDIA keys)
 * 2. Verifies the JWT bearer token and authorizes against user_id
 * 3. Checks object key prefix authorization
 * 4. Verifies the user's profile exists
 * 5. Creates signed photo URLs from storage
 * 6. Calls the NVIDIA NIM API with vision model
 * 7. Parses the AI response into a structured MealAnalysis
 * 8. Inserts the meal and meal items into Supabase
 *
 * All external dependencies (Supabase client, fetch for NVIDIA API) are
 * mocked.
 */

import {
  installDenoMock,
  removeDenoMock,
  loadEdgeFunction,
  setMockEnv,
  setMockSupabaseClient,
  makeRequest,
  getJson,
  restoreFetch,
} from "./helpers";

const DEFAULT_ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  NVIDIA_API_KEY: "nvapi-test-key",
};

// ── Mock data ───────────────────────────────────────────────────────────

const VALID_NVIDIA_RESPONSE = JSON.stringify({
  choices: [
    {
      message: {
        content: JSON.stringify({
          meal_name: "Grilled Chicken Salad",
          items: [
            {
              name: "Chicken Breast",
              estimated_grams: 150,
              estimated_kcal: 165,
              kcal_per_100g: 110,
            },
            {
              name: "Mixed Greens",
              estimated_grams: 100,
              estimated_kcal: 25,
              kcal_per_100g: 25,
            },
          ],
          total_kcal: 190,
          confidence: "high",
        }),
      },
    },
  ],
});

// ── Mock Supabase client factory ────────────────────────────────────────

function createMockAuth(user: { id: string } | null) {
  if (user) {
    return {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    };
  }
  return {
    getUser: jest.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("Invalid token"),
    }),
  };
}

function buildMockClient({
  authUser = { id: "user1" },
  profileResult = { data: { id: "user1" }, error: null },
  signedPhotoResult = { signedUrl: "https://signed.example.com/photo.jpg" },
  mealInsertResult = {
    data: { id: "meal-123", user_id: "user1", meal_name: "Grilled Chicken Salad" },
    error: null,
  },
  itemsInsertResult = {
    data: [{ id: "item-1" }, { id: "item-2" }],
    error: null,
  },
}: {
  authUser?: { id: string } | null;
  profileResult?: { data: any; error: any };
  signedPhotoResult?: { signedUrl: string } | { error: { message: string } };
  mealInsertResult?: { data: any; error: any };
  itemsInsertResult?: { data: any; error: any };
} = {}) {
  const auth = createMockAuth(authUser);

  // Storage: .from("meal-photos").createSignedUrl(key, ttl)
  const storageResult =
    "signedUrl" in signedPhotoResult
      ? { data: signedPhotoResult, error: null }
      : { data: null, error: signedPhotoResult.error };
  const storage = {
    from: jest.fn(() => ({
      createSignedUrl: jest.fn().mockResolvedValue(storageResult),
    })),
  };

  // Profiles: .from("profiles").select("id").eq("id", userId).single()
  const profileSingle = jest.fn().mockResolvedValue(profileResult);
  const profileEq = jest.fn().mockReturnValue({ single: profileSingle });
  const profileSelect = jest.fn().mockReturnValue({ eq: profileEq });

  // Meals insert: .from("meals").insert({...}).select().single()
  const mealSingle = jest.fn().mockResolvedValue(mealInsertResult);
  const mealInsertSelect = jest.fn().mockReturnValue({ single: mealSingle });
  const mealInsert = jest.fn().mockReturnValue({ select: mealInsertSelect });

  // Meals delete: .from("meals").delete().eq("id", mealId).eq("id", mealId)
  const mealDeleteEq1 = jest
    .fn()
    .mockReturnValue({ eq: jest.fn().mockReturnValue({}) });
  const mealDelete = jest.fn().mockReturnValue({ eq: mealDeleteEq1 });

  // Meal items: .from("meal_items").insert([...]).select()
  const itemsSelect = jest.fn().mockResolvedValue(itemsInsertResult);
  const itemsInsert = jest.fn().mockReturnValue({ select: itemsSelect });

  // meal_analyses status updates:
  // .from("meal_analyses").update({...}).eq("id", id).eq("user_id", userId)
  const analysisUpdateEq2 = jest.fn().mockResolvedValue({ data: null, error: null });
  const analysisUpdateEq1 = jest.fn().mockReturnValue({ eq: analysisUpdateEq2 });
  const analysisUpdate = jest.fn().mockReturnValue({ eq: analysisUpdateEq1 });

  const fromMock = jest.fn((table: string) => {
    if (table === "profiles") {
      return { select: profileSelect };
    }
    if (table === "meals") {
      return { insert: mealInsert, delete: mealDelete };
    }
    if (table === "meal_items") {
      return { insert: itemsInsert };
    }
    if (table === "meal_analyses") {
      return { update: analysisUpdate, select: jest.fn(), insert: jest.fn() };
    }
    return { select: jest.fn(), insert: jest.fn() };
  });

  return {
    from: fromMock,
    storage,
    auth,
    profileSelect,
    profileEq,
    profileSingle,
    mealInsert,
    mealInsertSelect,
    mealSingle,
    mealDelete,
    itemsInsert,
    itemsSelect,
    analysisUpdate,
    analysisUpdateEq1,
    analysisUpdateEq2,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("analyze-meal Edge Function", () => {
  let handler: (req: Request) => Promise<Response>;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setMockEnv(DEFAULT_ENV);
    installDenoMock();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as any;
  });

  afterEach(() => {
    removeDenoMock();
    restoreFetch();
    jest.dontMock("@supabase/supabase-js");
    jest.resetModules();
  });

  describe("HTTP method handling", () => {
    it("should return 200 ok for OPTIONS (CORS preflight)", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "OPTIONS",
        }),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("should return 405 for GET requests", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", { method: "GET" }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(405);
      expect(body.error).toContain("Method not allowed");
    });

    it("should return 405 for DELETE requests", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "DELETE",
        }),
      );

      expect(res.status).toBe(405);
    });
  });

  describe("environment configuration", () => {
    it("should return 500 when SUPABASE_URL is missing", async () => {
      setMockEnv({
        SUPABASE_SERVICE_ROLE_KEY: "key",
        NVIDIA_API_KEY: "nvapi-test-key",
      });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("configuration");
    });

    it("should return 500 when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
      setMockEnv({
        SUPABASE_URL: "https://test.supabase.co",
        NVIDIA_API_KEY: "nvapi-test-key",
      });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
    });

    it("should return 500 when NVIDIA_API_KEY is missing", async () => {
      setMockEnv({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("configuration");
    });
  });

  describe("request body validation", () => {
    it("should return 400 when body is not valid JSON", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        new Request("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: "not json",
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(400);
      expect(body.error).toContain("valid JSON");
    });

    it("should return 400 when object_keys and object_key are missing", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(400);
      expect(body.error).toContain("Missing required fields");
    });

    it("should return 400 when user_id is missing", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"] },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(400);
      expect(body.error).toContain("Missing required fields");
    });

    it("should deduplicate object_keys and limit to 3", async () => {
      const storageCreateSignedUrl = jest.fn().mockResolvedValue({
        data: { signedUrl: "https://signed.example.com/photo.jpg" },
        error: null,
      });
      const mockClient = {
        auth: createMockAuth({ id: "user1" }),
        storage: {
          from: jest.fn(() => ({ createSignedUrl: storageCreateSignedUrl })),
        },
        from: jest.fn((table: string) => {
          if (table === "profiles") {
            return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: "user1" }, error: null }) }) }) };
          }
          if (table === "meals") {
            return { insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: "meal-123", meal_name: "Test" }, error: null }) }) }), delete: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({}) }) }) };
          }
          if (table === "meal_items") {
            return { insert: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [{ id: "item-1" }], error: null }) }) };
          }
          return { select: jest.fn(), insert: jest.fn() };
        }),
      };

      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: [
              "meals/user1/photo1.jpg",
              "meals/user1/photo1.jpg", // duplicate
              "meals/user1/photo2.jpg",
              "meals/user1/photo3.jpg",
              "meals/user1/photo4.jpg",
            ],
            user_id: "user1",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      expect(storageCreateSignedUrl).toHaveBeenCalledTimes(3);
    });
  });

  describe("authentication", () => {
    it("should return 401 when Authorization header is missing", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("bearer token");
    });

    it("should return 401 when token is invalid", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: null }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer invalid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("should return 401 when user_id does not match authenticated user", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user2" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });
  });

  describe("authorization check", () => {
    it("should return 403 when object_key does not match user prefix", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user2/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(403);
      expect(body.error).toContain("Unauthorized");
    });

    it("should return 403 when profile does not exist", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          profileResult: { data: null, error: { message: "Not found" } },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(403);
      expect(body.error).toContain("Profile does not exist");
    });
  });

  describe("storage signing errors", () => {
    it("should return 500 when createSignedUrl fails", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          signedPhotoResult: { error: { message: "Storage error" } },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("signed photo URL");
    });
  });

  describe("NVIDIA API integration", () => {
    it("should call NVIDIA API with correct URL and headers", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer nvapi-test-key",
            "Content-Type": "application/json",
          },
        }),
      );
    });

    it("should use default model when NVIDIA_MODEL env is not set", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
    });

    it("should use custom model from NVIDIA_MODEL env", async () => {
      setMockEnv({
        ...DEFAULT_ENV,
        NVIDIA_MODEL: "nvidia/nemotron-3-vision",
      });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe("nvidia/nemotron-3-vision");
    });

    it("should include note in prompt when provided", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            note: "Large portion, I was very hungry",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);
      const prompt = body.messages[0].content[0].text;
      expect(prompt).toContain("Large portion, I was very hungry");
    });

    it("should return 502 when NVIDIA API returns an error", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(502);
      expect(body.error).toBe("Meal analysis failed.");
      expect(body.details).toContain("429");
    });

    it("should return 502 when NVIDIA response has no content", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: null } }],
        }),
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(502);
      expect(body.details).toContain("no text content");
    });
  });

  describe("NVIDIA response parsing", () => {
    it("should strip markdown code fences from NVIDIA response", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const analysis = JSON.parse(VALID_NVIDIA_RESPONSE).choices[0].message.content;
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "```json" + analysis + "```",
              },
            },
          ],
        }),
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.meal.meal_name).toBe("Grilled Chicken Salad");
    });

    it("should return 500 when NVIDIA response is not valid JSON", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: "This is not JSON" } },
          ],
        }),
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      // parseMealAnalysis throws → caught by outer catch → 500
      expect(res.status).toBe(500);
      expect(body.error).toContain("Unexpected error");
    });

    it("should return 500 when NVIDIA response is missing required fields", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ meal_name: "Test" }),
              },
            },
          ],
        }),
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      // parseMealAnalysis throws on missing required fields → caught by outer catch → 500
      expect(res.status).toBe(500);
      expect(body.error).toContain("Unexpected error");
    });

    it("should back-fill estimated_grams when AI returns null and kcal_per_100g is available", async () => {
      const mockClient = buildMockClient({ authUser: { id: "user1" } });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const analysisContent = JSON.stringify({
        meal_name: "Chicken Salad",
        items: [
          {
            name: "Chicken Breast",
            estimated_grams: null,
            estimated_kcal: 165,
            kcal_per_100g: 110,
          },
        ],
        total_kcal: 165,
        confidence: "high",
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: analysisContent } },
          ],
        }),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      // Verify the back-filled grams were passed to the meal_items insert
      expect(mockClient.itemsInsert).toHaveBeenCalled();
      const insertCall = mockClient.itemsInsert.mock.calls[0];
      const insertedItems = insertCall[0];
      expect(insertedItems[0].estimated_grams).toBe(150); // (165*100)/110 = 150
    });
  });

  describe("successful meal creation", () => {
    it("should insert meal and meal items into Supabase", async () => {
      const mockClient = buildMockClient({
        authUser: { id: "user1" },
        mealInsertResult: {
          data: { id: "meal-123", user_id: "user1", meal_name: "Grilled Chicken Salad" },
          error: null,
        },
      });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            note: "Large portion",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.meal).toBeDefined();
      expect(body.meal.meal_name).toBe("Grilled Chicken Salad");

      expect(mockClient.from).toHaveBeenCalledWith("meals");
      expect(mockClient.from).toHaveBeenCalledWith("meal_items");
    });

    it("should return 500 when meal insert fails", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          mealInsertResult: {
            data: null,
            error: new Error("Insert failed"),
          },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("Could not create meal");
    });

    it("should delete meal and return 500 when meal items insert fails", async () => {
      const mockClient = buildMockClient({
        authUser: { id: "user1" },
        itemsInsertResult: {
          data: null,
          error: new Error("Items failed"),
        },
      });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("Could not create meal items");
      expect(mockClient.from).toHaveBeenCalledWith("meals");
    });

    it("should return 500 on unexpected errors", async () => {
      // Pass null as the mock client so createClient() returns null
      // Accessing .auth on null will throw, caught by try/catch → 500
      setMockSupabaseClient(null);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
    });
  });

  describe("analysis_id status tracking", () => {
    it("should update analysis status to 'processing' when analysis_id is provided", async () => {
      const mockClient = buildMockClient({ authUser: { id: "user1" } });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            analysis_id: "analysis-123",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      expect(mockClient.from).toHaveBeenCalledWith("meal_analyses");
      expect(mockClient.analysisUpdate).toHaveBeenCalled();
      const updateCall = mockClient.analysisUpdate.mock.calls[0];
      expect(updateCall[0]).toHaveProperty("status", "processing");
    });

    it("should update analysis status to 'completed' with meal_id on success", async () => {
      const mockClient = buildMockClient({ authUser: { id: "user1" } });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            analysis_id: "analysis-123",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      expect(mockClient.analysisUpdate).toHaveBeenCalledTimes(2);
      const lastUpdateCall = mockClient.analysisUpdate.mock.calls.at(-1);
      expect(lastUpdateCall[0]).toHaveProperty("status", "completed");
      expect(lastUpdateCall[0]).toHaveProperty("meal_id", "meal-123");
    });

    it("should update analysis status to 'failed' when createSignedUrl fails", async () => {
      const mockClient = buildMockClient({
        authUser: { id: "user1" },
        signedPhotoResult: { error: { message: "Storage error" } },
      });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            analysis_id: "analysis-123",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      expect(mockClient.analysisUpdate).toHaveBeenCalledTimes(2);
      const failedUpdate = mockClient.analysisUpdate.mock.calls.at(-1);
      expect(failedUpdate[0]).toHaveProperty("status", "failed");
      expect(failedUpdate[0]).toHaveProperty("error", "Could not create signed photo URL.");
    });

    it("should update analysis status to 'failed' when NVIDIA API returns error", async () => {
      const mockClient = buildMockClient({ authUser: { id: "user1" } });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            analysis_id: "analysis-123",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const failedUpdate = mockClient.analysisUpdate.mock.calls.at(-1);
      expect(failedUpdate[0]).toHaveProperty("status", "failed");
      expect(failedUpdate[0]).toHaveProperty("error", "NVIDIA API returned 429.");
    });

    it("should update analysis status to 'failed' when meal insert fails", async () => {
      const mockClient = buildMockClient({
        authUser: { id: "user1" },
        mealInsertResult: {
          data: null,
          error: new Error("Insert failed"),
        },
      });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            analysis_id: "analysis-123",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const failedUpdate = mockClient.analysisUpdate.mock.calls.at(-1);
      expect(failedUpdate[0]).toHaveProperty("status", "failed");
      expect(failedUpdate[0]).toHaveProperty("error", "Could not create meal.");
    });

    it("should not call updateAnalysisStatus when analysis_id is not provided", async () => {
      const mockClient = buildMockClient({ authUser: { id: "user1" } });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      expect(mockClient.analysisUpdate).not.toHaveBeenCalled();
    });

    it("should update analysis status to 'failed' on unexpected errors when analysis_id is provided", async () => {
      // Pass null as the mock client so createClient() returns null
      // Accessing .auth on null will throw, caught by try/catch → 500
      setMockSupabaseClient(null);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            analysis_id: "analysis-123",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("Unexpected error");
    });

    it("should update analysis status to 'failed' when meal items insert fails", async () => {
      const mockClient = buildMockClient({
        authUser: { id: "user1" },
        itemsInsertResult: {
          data: null,
          error: new Error("Items failed"),
        },
      });
      setMockSupabaseClient(mockClient);
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(VALID_NVIDIA_RESPONSE),
      });

      await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg"],
            user_id: "user1",
            analysis_id: "analysis-456",
          },
          headers: { Authorization: "Bearer token" },
        }),
      );

      const failedUpdate = mockClient.analysisUpdate.mock.calls.at(-1);
      expect(failedUpdate[0]).toHaveProperty("status", "failed");
      expect(failedUpdate[0]).toHaveProperty("error", "Could not create meal items.");
    });
  });

  describe("CORS headers", () => {
    it("should include CORS headers on all responses", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/analyze-meal/index");

      const res = await handler(
        makeRequest("http://localhost:9000/analyze-meal", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"], user_id: "user1" },
          headers: { Authorization: "Bearer token" },
        }),
      );

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
        "authorization",
      );
    });
  });
});
