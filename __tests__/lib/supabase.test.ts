/**
 * Tests for the Supabase client creation (`lib/supabase.ts`).
 *
 * We mock `@supabase/supabase-js`'s `createClient` to verify that the app
 * wires up the client with the correct URL, anon key, and auth options.
 */

// Mock AsyncStorage (used as auth storage by the Supabase client)
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    mergeItem: jest.fn(),
    getAllKeys: jest.fn(),
    flushGetEmpties: jest.fn(),
  },
}));

describe("lib/supabase", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock("@supabase/supabase-js");
    jest.dontMock("@/lib/env");
  });

  it("should create the client with the configured URL and anon key", () => {
    jest.doMock("@/lib/env", () => ({
      env: {
        supabaseUrl: "https://my-project.supabase.co",
        supabaseAnonKey: "my-anon-key",
      },
    }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: jest.fn(() => ({ from: jest.fn(), auth: {}, storage: {} })),
    }));

    require("@/lib/supabase");
    const { createClient } = require("@supabase/supabase-js");

    expect(createClient).toHaveBeenCalledWith(
      "https://my-project.supabase.co",
      "my-anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          storage: expect.anything(),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        }),
      }),
    );
  });

  it("should configure auth with AsyncStorage as storage", () => {
    jest.doMock("@/lib/env", () => ({
      env: {
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "test-anon-key",
      },
    }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: jest.fn(() => ({ from: jest.fn(), auth: {}, storage: {} })),
    }));

    require("@/lib/supabase");
    const { createClient } = require("@supabase/supabase-js");
    const [, , options] = (createClient as jest.Mock).mock.calls[0];

    expect(options.auth).toBeDefined();
    expect(options.auth.storage).toBeDefined();
    expect(options.auth.autoRefreshToken).toBe(true);
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.detectSessionInUrl).toBe(false);
  });

  it("should pass empty strings when env vars are missing", () => {
    jest.doMock("@/lib/env", () => ({
      env: {
        supabaseUrl: "",
        supabaseAnonKey: "",
      },
    }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: jest.fn(() => ({ from: jest.fn(), auth: {}, storage: {} })),
    }));

    require("@/lib/supabase");
    const { createClient } = require("@supabase/supabase-js");

    expect(createClient).toHaveBeenCalledWith("", "", expect.any(Object));
  });

  it("should call createClient exactly once per module load", () => {
    jest.doMock("@/lib/env", () => ({
      env: {
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "test-anon-key",
      },
    }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: jest.fn(() => ({ from: jest.fn(), auth: {}, storage: {} })),
    }));

    require("@/lib/supabase");
    const { createClient } = require("@supabase/supabase-js");

    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("should create a new client after module reset", () => {
    jest.doMock("@/lib/env", () => ({
      env: {
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "test-anon-key",
      },
    }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: jest.fn(() => ({ from: jest.fn(), auth: {}, storage: {} })),
    }));

    require("@/lib/supabase");
    const { createClient } = require("@supabase/supabase-js");
    expect(createClient).toHaveBeenCalledTimes(1);

    // Reset and load again — should create a new client
    jest.resetModules();
    jest.doMock("@/lib/env", () => ({
      env: {
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "test-anon-key",
      },
    }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient: jest.fn(() => ({ from: jest.fn(), auth: {}, storage: {} })),
    }));

    require("@/lib/supabase");
    const { createClient: createClient2 } = require("@supabase/supabase-js");
    expect(createClient2).toHaveBeenCalledTimes(1);
  });
});
