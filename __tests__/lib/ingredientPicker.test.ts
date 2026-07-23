import {
  setIngredientPicker,
  pickIngredient,
  hasIngredientPicker,
} from '@/lib/ingredientPicker';
import type { UserIngredient } from '@/types/database';

describe('ingredientPicker', () => {
  const mockIngredient: UserIngredient = {
    id: 'ing1',
    user_id: 'user1',
    name: 'Chicken Breast',
    kcal_per_100g: 165,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };

  describe('setIngredientPicker', () => {
    it('should set the active ingredient picker handler', () => {
      const handler = jest.fn();
      setIngredientPicker(handler);
      expect(hasIngredientPicker()).toBe(true);
    });

    it('should set handler to null when called with null', () => {
      setIngredientPicker(null);
      expect(hasIngredientPicker()).toBe(false);
    });
  });

  describe('pickIngredient', () => {
    it('should call the active handler with the ingredient', () => {
      const handler = jest.fn();
      setIngredientPicker(handler);

      pickIngredient(mockIngredient);

      expect(handler).toHaveBeenCalledWith(mockIngredient);
    });

    it('should not throw when no handler is set', () => {
      setIngredientPicker(null);
      expect(() => pickIngredient(mockIngredient)).not.toThrow();
    });

    it('should clear the handler after picking', () => {
      const handler = jest.fn();
      setIngredientPicker(handler);

      pickIngredient(mockIngredient);

      expect(hasIngredientPicker()).toBe(false);
    });
  });

  describe('hasIngredientPicker', () => {
    it('should return false when no handler is set', () => {
      setIngredientPicker(null);
      expect(hasIngredientPicker()).toBe(false);
    });

    it('should return true when handler is set', () => {
      setIngredientPicker(jest.fn());
      expect(hasIngredientPicker()).toBe(true);
    });
  });
});
