import { analyzeMeal, getSignedPhotoUrl, getSignedPhotoUrls } from '@/lib/meals';

// Mock the supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase';

describe('meals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeMeal', () => {
    it('should call analyze-meal function with correct parameters', async () => {
      const mockData = { meal: { id: '123', total_kcal: 500 } };
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockData,
        error: null,
      });

      const result = await analyzeMeal({
        objectKeys: ['meals/user1/photo1.jpg'],
        userId: 'user1',
        note: 'Large portion',
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('analyze-meal', {
        body: {
          object_key: 'meals/user1/photo1.jpg',
          object_keys: ['meals/user1/photo1.jpg'],
          user_id: 'user1',
          note: 'Large portion',
        },
      });
      expect(result).toEqual(mockData);
    });

    it('should handle single objectKey parameter', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { meal: { id: '123' } },
        error: null,
      });

      await analyzeMeal({
        objectKey: 'meals/user1/photo1.jpg',
        userId: 'user1',
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('analyze-meal', {
        body: {
          object_key: 'meals/user1/photo1.jpg',
          object_keys: ['meals/user1/photo1.jpg'],
          user_id: 'user1',
          note: undefined,
        },
      });
    });

    it('should handle empty objectKeys array', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { meal: { id: '123' } },
        error: null,
      });

      await analyzeMeal({
        objectKeys: [],
        userId: 'user1',
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('analyze-meal', {
        body: {
          object_key: undefined,
          object_keys: [],
          user_id: 'user1',
          note: undefined,
        },
      });
    });

    it('should throw error when function returns error', async () => {
      const mockError = {
        message: 'Function failed',
        context: new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 }),
      };
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(analyzeMeal({
        objectKeys: ['meals/user1/photo1.jpg'],
        userId: 'user1',
      })).rejects.toThrow('Invalid request');
    });

    it('should throw generic error when context is not a Response', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Some error' },
      });

      await expect(analyzeMeal({
        objectKeys: ['meals/user1/photo1.jpg'],
        userId: 'user1',
      })).rejects.toThrow('Could not analyze meal.');
    });

    it('should throw error with status code when response parsing fails', async () => {
      const mockError = {
        message: 'Function failed',
        context: new Response('Not JSON', { status: 500 }),
      };
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(analyzeMeal({
        objectKeys: ['meals/user1/photo1.jpg'],
        userId: 'user1',
      })).rejects.toThrow('Could not analyze meal. Status 500.');
    });

    it('should handle note parameter being undefined', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { meal: { id: '123' } },
        error: null,
      });

      await analyzeMeal({
        objectKeys: ['meals/user1/photo1.jpg'],
        userId: 'user1',
        note: undefined,
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('analyze-meal', {
        body: {
          object_key: 'meals/user1/photo1.jpg',
          object_keys: ['meals/user1/photo1.jpg'],
          user_id: 'user1',
          note: undefined,
        },
      });
    });

    it('should handle note parameter being empty string', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { meal: { id: '123' } },
        error: null,
      });

      await analyzeMeal({
        objectKeys: ['meals/user1/photo1.jpg'],
        userId: 'user1',
        note: '',
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('analyze-meal', {
        body: {
          object_key: 'meals/user1/photo1.jpg',
          object_keys: ['meals/user1/photo1.jpg'],
          user_id: 'user1',
          note: '',
        },
      });
    });
  });

  describe('getSignedPhotoUrl', () => {
    it('should return signedUrl from response', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { signedUrl: 'https://signed.url/photo.jpg' },
        error: null,
      });

      const result = await getSignedPhotoUrl('meals/user1/photo1.jpg');
      expect(result).toBe('https://signed.url/photo.jpg');
    });

    it('should return signed_url from response if signedUrl not present', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { signed_url: 'https://signed.url/photo.jpg' },
        error: null,
      });

      const result = await getSignedPhotoUrl('meals/user1/photo1.jpg');
      expect(result).toBe('https://signed.url/photo.jpg');
    });

    it('should throw error when signedUrl is missing', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { otherField: 'value' },
        error: null,
      });

      await expect(getSignedPhotoUrl('meals/user1/photo1.jpg')).rejects.toThrow(
        'get-photo-url did not return a signed URL.'
      );
    });

    it('should throw error when signedUrl is not a string', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { signedUrl: 123 },
        error: null,
      });

      await expect(getSignedPhotoUrl('meals/user1/photo1.jpg')).rejects.toThrow(
        'get-photo-url did not return a signed URL.'
      );
    });

    it('should throw error when function returns error', async () => {
      const mockError = {
        message: 'Function failed',
        context: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      };
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(getSignedPhotoUrl('meals/user1/photo1.jpg')).rejects.toThrow('Unauthorized');
    });
  });

  describe('getSignedPhotoUrls', () => {
    it('should return empty object for empty input', async () => {
      const result = await getSignedPhotoUrls([]);
      expect(result).toEqual({});
    });

    it('should return empty object for falsy values only', async () => {
      const result = await getSignedPhotoUrls([null as any, undefined as any, '']);
      expect(result).toEqual({});
    });

    it('should deduplicate object keys', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { urls: { 'key1': 'url1' } },
        error: null,
      });

      await getSignedPhotoUrls(['key1', 'key1', 'key1']);

      expect(supabase.functions.invoke).toHaveBeenCalledWith('get-photo-urls', {
        body: {
          object_keys: ['key1'],
        },
      });
    });

    it('should return urls mapping from response', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { urls: { 'key1': 'url1', 'key2': 'url2' } },
        error: null,
      });

      const result = await getSignedPhotoUrls(['key1', 'key2']);
      expect(result).toEqual({ 'key1': 'url1', 'key2': 'url2' });
    });

    it('should throw error when urls field is missing', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { otherField: 'value' },
        error: null,
      });

      await expect(getSignedPhotoUrls(['key1'])).rejects.toThrow(
        'get-photo-urls did not return signed URLs.'
      );
    });

    it('should throw error when urls field is not an object', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { urls: 'not-an-object' },
        error: null,
      });

      await expect(getSignedPhotoUrls(['key1'])).rejects.toThrow(
        'get-photo-urls did not return signed URLs.'
      );
    });

    it('should throw error when function returns error', async () => {
      const mockError = {
        message: 'Function failed',
        context: new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      };
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(getSignedPhotoUrls(['key1'])).rejects.toThrow('Server error');
    });
  });
});
