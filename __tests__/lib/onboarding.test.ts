import { ensureProfile } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

// Mock the supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

describe('onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureProfile', () => {
    const mockProfile = {
      id: 'user1',
      name: 'Test User',
      daily_goal_kcal: 2000,
      color: '#3f9c75',
      avatar_url: null,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    };

    const createMockChain = (maybeSingleResult: Promise<any>) => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue(maybeSingleResult),
        }),
      }),
    });

    it('should return existing profile when one exists', async () => {
      (supabase.from as jest.Mock).mockReturnValue(
        createMockChain({ data: mockProfile, error: null })
      );

      const result = await ensureProfile({
        userId: 'user1',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result).toEqual(mockProfile);
      expect(supabase.from).toHaveBeenCalledWith('profiles');
    });

    it('should create a new profile when none exists', async () => {
      const mockAuthData = {
        user: {
          user_metadata: {
            full_name: 'John Doe',
          },
        },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: mockAuthData });

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(createMockChain({ data: null, error: null }))
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  ...mockProfile,
                  name: 'John Doe',
                },
                error: null,
              }),
            }),
          }),
        });

      const result = await ensureProfile({
        userId: 'user1',
        email: 'test@example.com',
      });

      expect(result.name).toBe('John Doe');
      expect(result.daily_goal_kcal).toBe(2000);
      expect(result.color).toBe('#3f9c75');
    });

    it('should use provided name over metadata name', async () => {
      const mockAuthData = {
        user: {
          user_metadata: {
            full_name: 'Metadata Name',
          },
        },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: mockAuthData });

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(createMockChain({ data: null, error: null }))
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  ...mockProfile,
                  name: 'Provided Name',
                },
                error: null,
              }),
            }),
          }),
        });

      const result = await ensureProfile({
        userId: 'user1',
        email: 'test@example.com',
        name: 'Provided Name',
      });

      expect(result.name).toBe('Provided Name');
    });

    it('should use "Me" as default name when no name provided', async () => {
      const mockAuthData = {
        user: {
          user_metadata: {},
        },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: mockAuthData });

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(createMockChain({ data: null, error: null }))
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  ...mockProfile,
                  name: 'Me',
                },
                error: null,
              }),
            }),
          }),
        });

      const result = await ensureProfile({
        userId: 'user1',
        email: 'test@example.com',
      });

      expect(result.name).toBe('Me');
    });

    it('should throw error when profile creation fails with error object', async () => {
      const mockAuthData = {
        user: {
          user_metadata: {},
        },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: mockAuthData });

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(createMockChain({ data: null, error: null }))
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: new Error('Insert failed'),
              }),
            }),
          }),
        });

      await expect(ensureProfile({
        userId: 'user1',
        email: 'test@example.com',
      })).rejects.toThrow('Insert failed');
    });

    it('should throw error when profile insert returns no data', async () => {
      const mockAuthData = {
        user: {
          user_metadata: {},
        },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: mockAuthData });

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(createMockChain({ data: null, error: null }))
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        });

      await expect(ensureProfile({
        userId: 'user1',
        email: 'test@example.com',
      })).rejects.toThrow('Could not create profile.');
    });

    it('should clean up name by trimming and normalizing whitespace', async () => {
      const mockAuthData = {
        user: {
          user_metadata: {},
        },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: mockAuthData });

      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              ...mockProfile,
              name: 'John Doe',
            },
            error: null,
          }),
        }),
      });

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(createMockChain({ data: null, error: null }))
        .mockReturnValueOnce({ insert: mockInsert });

      await ensureProfile({
        userId: 'user1',
        email: 'test@example.com',
        name: '  John   Doe  ',
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'John Doe',
        })
      );
    });

    it('should use name from user_metadata.name if full_name not present', async () => {
      const mockAuthData = {
        user: {
          user_metadata: {
            name: 'Meta Name',
          },
        },
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: mockAuthData });

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(createMockChain({ data: null, error: null }))
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  ...mockProfile,
                  name: 'Meta Name',
                },
                error: null,
              }),
            }),
          }),
        });

      const result = await ensureProfile({
        userId: 'user1',
        email: 'test@example.com',
      });

      expect(result.name).toBe('Meta Name');
    });
  });
});
