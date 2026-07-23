import { env, assertClientEnv } from '@/lib/env';

describe('env', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('env object', () => {
    it('should read EXPO_PUBLIC_SUPABASE_URL from process.env', () => {
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      // Need to re-evaluate the module
      jest.resetModules();
      const { env } = require('@/lib/env');
      expect(env.supabaseUrl).toBe('https://test.supabase.co');
    });

    it('should read EXPO_PUBLIC_SUPABASE_ANON_KEY from process.env', () => {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      jest.resetModules();
      const { env } = require('@/lib/env');
      expect(env.supabaseAnonKey).toBe('test-anon-key');
    });

    it('should default to empty string when env vars are missing', () => {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      jest.resetModules();
      const { env } = require('@/lib/env');
      expect(env.supabaseUrl).toBe('');
      expect(env.supabaseAnonKey).toBe('');
    });
  });

  describe('assertClientEnv', () => {
    it('should not throw when both env vars are set', () => {
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      jest.resetModules();
      const { assertClientEnv } = require('@/lib/env');
      expect(() => assertClientEnv()).not.toThrow();
    });

    it('should throw when EXPO_PUBLIC_SUPABASE_URL is missing', () => {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      jest.resetModules();
      const { assertClientEnv } = require('@/lib/env');
      expect(() => assertClientEnv()).toThrow(
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.'
      );
    });

    it('should throw when EXPO_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      jest.resetModules();
      const { assertClientEnv } = require('@/lib/env');
      expect(() => assertClientEnv()).toThrow(
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.'
      );
    });

    it('should throw when both env vars are missing', () => {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      jest.resetModules();
      const { assertClientEnv } = require('@/lib/env');
      expect(() => assertClientEnv()).toThrow(
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.'
      );
    });
  });
});
