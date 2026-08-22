import { analyzeMeal, getSignedPhotoUrl, getSignedPhotoUrls, startMealAnalysis, subscribeToMealAnalyses, getPendingAnalyses, bulkAnalyzePhotos } from '@/lib/meals';

// Mock the supabase client — use a mutable holder so we can access the
// mock functions from within tests after the jest.mock factory runs.
jest.mock('@/lib/supabase', () => {
  const invoke = jest.fn();
  const from = jest.fn();
  const channel = jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnValue('channel'),
  }));
  const removeChannel = jest.fn();
  return {
    supabase: {
      functions: { invoke },
      from,
      channel,
      removeChannel,
    },
  };
});

// Mock upload so bulkAnalyzePhotos tests don't hit the filesystem
jest.mock('@/lib/upload', () => ({
  uploadMealPhotos: jest.fn(),
}));

import { supabase } from '@/lib/supabase';
import { uploadMealPhotos } from '@/lib/upload';

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

  describe('startMealAnalysis', () => {
    it('should create a pending analysis record and invoke the edge function without analysis_id', async () => {
      const mockAnalysis = {
        id: 'analysis-123',
        user_id: 'user1',
        object_keys: ['meals/user1/photo.jpg'],
        note: 'Large portion',
        status: 'pending',
        meal_id: null,
        error: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockAnalysis, error: null }),
          }),
        }),
        select: jest.fn(),
        update: jest.fn(),
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

      const result = await startMealAnalysis({
        objectKeys: ['meals/user1/photo.jpg'],
        userId: 'user1',
        note: 'Large portion',
      });

      expect(supabase.from).toHaveBeenCalledWith('meal_analyses');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('analyze-meal', {
        body: {
          object_key: 'meals/user1/photo.jpg',
          object_keys: ['meals/user1/photo.jpg'],
          user_id: 'user1',
          analysis_id: 'analysis-123',
          note: 'Large portion',
        },
      });
      expect(result).toEqual(mockAnalysis);
    });

    it('should throw when analysis record creation fails', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
          }),
        }),
        select: jest.fn(),
        update: jest.fn(),
      });

      await expect(startMealAnalysis({
        objectKeys: ['meals/user1/photo.jpg'],
        userId: 'user1',
      })).rejects.toThrow('DB error');
    });

    it('should not await the Edge Function invocation (fire-and-forget)', async () => {
      const mockAnalysis = {
        id: 'analysis-456',
        user_id: 'user1',
        object_keys: ['meals/user1/photo1.jpg', 'meals/user1/photo2.jpg'],
        note: null,
        status: 'pending',
        meal_id: null,
        error: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockAnalysis, error: null }),
          }),
        }),
        select: jest.fn(),
        update: jest.fn(),
      });

      // Make the invoke mock hang indefinitely to prove it's not awaited
      let invokeResolve: (value: any) => void;
      const invokePromise = new Promise((resolve) => {
        invokeResolve = resolve;
      });
      (supabase.functions.invoke as jest.Mock).mockReturnValue(invokePromise);

      const result = await startMealAnalysis({
        objectKeys: ['meals/user1/photo1.jpg', 'meals/user1/photo2.jpg'],
        userId: 'user1',
      });

      // Should have returned the analysis record without waiting for the invoke
      expect(result).toEqual(mockAnalysis);
      expect(supabase.functions.invoke).toHaveBeenCalled();

      // Clean up the hanging promise
      invokeResolve!({ data: null, error: null });
    });
  });

  describe('subscribeToMealAnalyses', () => {
    it('should create a Realtime channel filtered by user_id', () => {
      const callbacks = {
        onUpdated: jest.fn(),
        onError: jest.fn(),
      };

      subscribeToMealAnalyses('user1', callbacks);

      expect(supabase.channel).toHaveBeenCalled();
      const channelCall = (supabase.channel as jest.Mock).mock.calls[0];      expect(channelCall[0]).toContain('meal_analyses');
      expect(channelCall[0]).toContain('user1');
    });
  });

  describe('getPendingAnalyses', () => {
    it('should query meal_analyses for pending and processing records', async () => {
      const mockData = [
        { id: 'a1', status: 'pending', user_id: 'user1' },
        { id: 'a2', status: 'processing', user_id: 'user1' },
      ];

      const mockOrder = jest.fn().mockResolvedValue({ data: mockData, error: null });
      const mockIn = jest.fn().mockReturnValue({ order: mockOrder });
      const mockEq = jest.fn().mockReturnValue({ in: mockIn });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({ eq: mockEq }),
      });

      const result = await getPendingAnalyses('user1');

      expect(supabase.from).toHaveBeenCalledWith('meal_analyses');
      expect(result).toEqual(mockData);
    });

    it('should return empty array when no pending analyses exist', async () => {
      const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
      const mockIn = jest.fn().mockReturnValue({ order: mockOrder });
      const mockEq = jest.fn().mockReturnValue({ in: mockIn });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({ eq: mockEq }),
      });

      const result = await getPendingAnalyses('user1');
      expect(result).toEqual([]);
    });

    it('should throw error when query fails', async () => {
      const mockOrder = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query failed' },
      });
      const mockIn = jest.fn().mockReturnValue({ order: mockOrder });
      const mockEq = jest.fn().mockReturnValue({ in: mockIn });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({ eq: mockEq }),
      });

      await expect(getPendingAnalyses('user1')).rejects.toThrow('Could not load pending analyses');
    });
  });

  describe('bulkAnalyzePhotos', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should split photos into groups of 3 and start an analysis for each', async () => {
      (uploadMealPhotos as jest.Mock).mockImplementation(async (uris: string[]) =>
        uris.map((_, i) => `meals/object-key-${i}`),
      );

      const mockAnalysis = {
        id: 'analysis-1',
        user_id: 'user1',
        object_keys: ['meals/object-key-0'],
        note: null,
        status: 'pending',
        meal_id: null,
        error: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockAnalysis, error: null }),
          }),
        }),
      });

      (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

      const uris = ['uri0', 'uri1', 'uri2', 'uri3', 'uri4', 'uri5', 'uri6'];
      const result = await bulkAnalyzePhotos({
        uris,
        userId: 'user1',
        startDate: '2025-01-01',
        endDate: '2025-01-03',
      });

      // 7 photos → ceil(7/3) = 3 meal groups
      expect(result.started).toBe(3);
      expect(result.failed).toBe(0);
      expect(uploadMealPhotos).toHaveBeenCalledTimes(3);
      expect(supabase.from).toHaveBeenCalledWith('meal_analyses');
    });

    it('should return {started: 0, failed: 0} for empty uris', async () => {
      const result = await bulkAnalyzePhotos({
        uris: [],
        userId: 'user1',
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      });
      expect(result).toEqual({ started: 0, failed: 0 });
    });

    it('should count failures when upload or analysis fails', async () => {
      (uploadMealPhotos as jest.Mock).mockRejectedValue(new Error('Upload failed'));

      const result = await bulkAnalyzePhotos({
        uris: ['uri0'],
        userId: 'user1',
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      });

      expect(result.started).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should call onProgress callback during processing', async () => {
      (uploadMealPhotos as jest.Mock).mockResolvedValue(['key1']);
      const mockAnalysis = {
        id: 'a1', user_id: 'user1', object_keys: ['key1'], note: null,
        status: 'pending', meal_id: null, error: null,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };

      (supabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockAnalysis, error: null }),
          }),
        }),
      });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

      const progressCalls: number[] = [];
      await bulkAnalyzePhotos({
        uris: ['uri0', 'uri1', 'uri2', 'uri3'],
        userId: 'user1',
        startDate: '2025-01-01',
        endDate: '2025-01-01',
        onProgress: (current, total) => { progressCalls.push(current); expect(total).toBe(2); },
      });

      expect(progressCalls).toEqual([1, 2, 2]);
    });

    it('should distribute meals across the date range', async () => {
      (uploadMealPhotos as jest.Mock).mockResolvedValue(['key1']);

      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'a1', user_id: 'user1', object_keys: ['key1'], note: null,
              status: 'pending', meal_id: null, error: null,
              created_at: '2025-01-01', updated_at: '2025-01-01',
            },
            error: null,
          }),
        }),
      });

      (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

      await bulkAnalyzePhotos({
        uris: ['uri0', 'uri1', 'uri2', 'uri3', 'uri4', 'uri5', 'uri6', 'uri7', 'uri8', 'uri9'],
        userId: 'user1',
        startDate: '2025-01-01',
        endDate: '2025-01-03',
      });

      // 10 photos → 4 meal groups; verify insert called 4 times
      expect(mockInsert).toHaveBeenCalledTimes(4);
    });
  });
});
