import { uploadMealPhoto, uploadMealPhotos } from '@/lib/upload';
import { supabase } from '@/lib/supabase';

// Mock dependencies
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  uploadAsync: jest.fn(),
  FileSystemUploadType: {
    BINARY_CONTENT: 'binary',
  },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

describe('upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadMealPhoto', () => {
    it('should compress and upload a photo successfully', async () => {
      const mockCompressed = { uri: 'file://compressed.jpg' };
      const mockPresigned = {
        uploadUrl: 'https://upload.url',
        objectKey: 'meals/user1/photo123.jpg',
      };

      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue(mockCompressed);
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: mockPresigned,
        error: null,
      });
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({
        status: 200,
      });

      const result = await uploadMealPhoto('file://original.jpg');

      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file://original.jpg',
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: 'jpeg' }
      );
      expect(supabase.functions.invoke).toHaveBeenCalledWith('get-upload-url', {
        body: {
          content_type: 'image/jpeg',
          file_ext: 'jpg',
        },
      });
      expect(FileSystem.uploadAsync).toHaveBeenCalledWith(
        'https://upload.url',
        'file://compressed.jpg',
        expect.objectContaining({
          httpMethod: 'PUT',
          uploadType: 'binary',
          headers: { 'Content-Type': 'image/jpeg' },
        })
      );
      expect(result).toBe('meals/user1/photo123.jpg');
    });

    it('should throw error when upload URL response is missing fields', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file://compressed.jpg' });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { uploadUrl: 'https://upload.url' }, // missing objectKey
        error: null,
      });

      await expect(uploadMealPhoto('file://original.jpg')).rejects.toThrow(
        'Upload URL response was missing uploadUrl or objectKey.'
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

      await expect(uploadMealPhoto('file://original.jpg')).rejects.toThrow('Unauthorized');
    });

    it('should throw generic error when context is not a Response', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Some error' },
      });

      await expect(uploadMealPhoto('file://original.jpg')).rejects.toThrow(
        'Could not create a signed upload URL.'
      );
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

      await expect(uploadMealPhoto('file://original.jpg')).rejects.toThrow(
        'Could not create a signed upload URL. Status 500.'
      );
    });

    it('should throw error when upload fails', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file://compressed.jpg' });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { uploadUrl: 'https://upload.url', objectKey: 'meals/user1/photo123.jpg' },
        error: null,
      });
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({
        status: 500,
      });

      await expect(uploadMealPhoto('file://original.jpg')).rejects.toThrow('Photo upload failed.');
    });

    it('should use correct compression settings', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file://compressed.jpg' });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { uploadUrl: 'https://upload.url', objectKey: 'meals/user1/photo123.jpg' },
        error: null,
      });
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 200 });

      await uploadMealPhoto('file://original.jpg');

      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file://original.jpg',
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: 'jpeg' }
      );
    });
  });

  describe('uploadMealPhotos', () => {
    it('should upload multiple photos and return object keys', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file://compressed.jpg' });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { uploadUrl: 'https://upload.url', objectKey: 'meals/user1/photo123.jpg' },
        error: null,
      });
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await uploadMealPhotos([
        'file://photo1.jpg',
        'file://photo2.jpg',
        'file://photo3.jpg',
      ]);

      expect(result).toHaveLength(3);
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(3);
    });

    it('should limit to 3 photos', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file://compressed.jpg' });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { uploadUrl: 'https://upload.url', objectKey: 'meals/user1/photo123.jpg' },
        error: null,
      });
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await uploadMealPhotos([
        'file://photo1.jpg',
        'file://photo2.jpg',
        'file://photo3.jpg',
        'file://photo4.jpg',
        'file://photo5.jpg',
      ]);

      expect(result).toHaveLength(3);
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(3);
    });

    it('should return empty array for empty input', async () => {
      const result = await uploadMealPhotos([]);
      expect(result).toEqual([]);
    });

    it('should upload photos sequentially', async () => {
      const invokeMock = supabase.functions.invoke as jest.Mock;
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file://compressed.jpg' });
      invokeMock
        .mockResolvedValueOnce({
          data: { uploadUrl: 'https://upload.url', objectKey: 'meals/user1/photo1.jpg' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { uploadUrl: 'https://upload.url', objectKey: 'meals/user1/photo2.jpg' },
          error: null,
        });
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 200 });

      const result = await uploadMealPhotos(['file://photo1.jpg', 'file://photo2.jpg']);

      expect(result).toEqual(['meals/user1/photo1.jpg', 'meals/user1/photo2.jpg']);
    });

    it('should stop and throw if any upload fails', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file://compressed.jpg' });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { uploadUrl: 'https://upload.url', objectKey: 'meals/user1/photo123.jpg' },
        error: null,
      });
      (FileSystem.uploadAsync as jest.Mock)
        .mockResolvedValueOnce({ status: 200 })
        .mockResolvedValueOnce({ status: 500 });

      await expect(uploadMealPhotos(['file://photo1.jpg', 'file://photo2.jpg'])).rejects.toThrow(
        'Photo upload failed.'
      );
    });
  });
});
