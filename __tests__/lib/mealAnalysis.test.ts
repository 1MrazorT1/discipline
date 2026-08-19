import { parseMealAnalysis, computeKcalPer100g, computeEstimatedGrams, getKcalPer100g, getEstimatedGrams } from "@/lib/mealAnalysis";

describe("mealAnalysis", () => {
  describe("parseMealAnalysis", () => {
    it("should parse a valid response with kcal_per_100g", () => {
      const content = JSON.stringify({
        meal_name: "Chicken salad",
        items: [
          {
            name: "Chicken breast",
            estimated_grams: 150,
            estimated_kcal: 330,
            kcal_per_100g: 165,
          },
        ],
        total_kcal: 330,
        confidence: "high",
      });

      const result = parseMealAnalysis(content);

      expect(result).toEqual({
        meal_name: "Chicken salad",
        items: [
          {
            name: "Chicken breast",
            estimated_grams: 150,
            estimated_kcal: 330,
            kcal_per_100g: 165,
            volume_ml: null,
            quantity: null,
          },
        ],
        total_kcal: 330,
        confidence: "high",
      });
    });

    it("should default kcal_per_100g to null when not provided by AI", () => {
      const content = JSON.stringify({
        meal_name: "Rice bowl",
        items: [
          {
            name: "Rice",
            estimated_grams: 200,
            estimated_kcal: 260,
          },
        ],
        total_kcal: 260,
        confidence: "medium",
      });

      const result = parseMealAnalysis(content);

      expect(result.items[0].kcal_per_100g).toBeNull();
      expect(result.items[0].volume_ml).toBeNull();
      expect(result.items[0].quantity).toBeNull();
    });

    it("should handle null kcal_per_100g in AI response", () => {
      const content = JSON.stringify({
        meal_name: "Unknown dish",
        items: [
          {
            name: "Mystery ingredient",
            estimated_grams: null,
            estimated_kcal: 100,
            kcal_per_100g: null,
          },
        ],
        total_kcal: 100,
        confidence: "low",
      });

      const result = parseMealAnalysis(content);
      expect(result.items[0].kcal_per_100g).toBeNull();
    });

    it("should strip markdown code fences from JSON response", () => {
      const content = `\`\`\`json
{
  "meal_name": "Pasta",
  "items": [{"name": "Pasta", "estimated_grams": 100, "estimated_kcal": 130, "kcal_per_100g": 130}],
  "total_kcal": 130,
  "confidence": "high"
}
\`\`\``;

      const result = parseMealAnalysis(content);
      expect(result.meal_name).toBe("Pasta");
      expect(result.items[0].name).toBe("Pasta");
    });

    it("should round total_kcal to nearest integer", () => {
      const content = JSON.stringify({
        meal_name: "Test",
        items: [{ name: "Food", estimated_grams: 100, estimated_kcal: 130.7, kcal_per_100g: 130.7 }],
        total_kcal: 130.7,
        confidence: "high",
      });

      const result = parseMealAnalysis(content);
      expect(result.total_kcal).toBe(131);
      expect(result.items[0].estimated_kcal).toBe(131);
    });

    it("should preserve kcal_per_100g decimal precision", () => {
      const content = JSON.stringify({
        meal_name: "Test",
        items: [{ name: "Food", estimated_grams: 100, estimated_kcal: 130, kcal_per_100g: 130.6 }],
        total_kcal: 130,
        confidence: "high",
      });

      const result = parseMealAnalysis(content);
      expect(result.items[0].kcal_per_100g).toBe(130.6);
    });

    it("should throw on invalid JSON", () => {
      expect(() => parseMealAnalysis("not json")).toThrow("Could not parse meal analysis JSON.");
    });

    it("should throw on non-object JSON", () => {
      expect(() => parseMealAnalysis("[]")).toThrow("did not match the expected");
    });

    it("should throw on missing meal_name", () => {
      const content = JSON.stringify({ items: [], total_kcal: 100, confidence: "high" });
      expect(() => parseMealAnalysis(content)).toThrow("did not match the expected");
    });

    it("should throw on missing items", () => {
      const content = JSON.stringify({ meal_name: "Test", total_kcal: 100, confidence: "high" });
      expect(() => parseMealAnalysis(content)).toThrow("did not match the expected");
    });

    it("should throw on missing total_kcal", () => {
      const content = JSON.stringify({ meal_name: "Test", items: [], confidence: "high" });
      expect(() => parseMealAnalysis(content)).toThrow("did not match the expected");
    });

    it("should throw on invalid confidence", () => {
      const content = JSON.stringify({
        meal_name: "Test",
        items: [],
        total_kcal: 100,
        confidence: "very-high",
      });
      expect(() => parseMealAnalysis(content)).toThrow("did not match the expected");
    });

    it("should throw on item missing required fields", () => {
      const content = JSON.stringify({
        meal_name: "Test",
        items: [{ name: "Food", kcal_per_100g: 100 }],
        total_kcal: 100,
        confidence: "high",
      });
      expect(() => parseMealAnalysis(content)).toThrow("invalid meal item");
    });

    it("should throw on item with invalid estimated_kcal type", () => {
      const content = JSON.stringify({
        meal_name: "Test",
        items: [{ name: "Food", estimated_kcal: "high", kcal_per_100g: 100 }],
        total_kcal: 100,
        confidence: "high",
      });
      expect(() => parseMealAnalysis(content)).toThrow("invalid meal item");
    });

    it("should handle multiple items with mixed kcal_per_100g", () => {
      const content = JSON.stringify({
        meal_name: "Mixed meal",
        items: [
          { name: "Protein", estimated_grams: 100, estimated_kcal: 150, kcal_per_100g: 150 },
          { name: "Carbs", estimated_grams: 200, estimated_kcal: 260 },
          { name: "Fat", estimated_grams: null, estimated_kcal: 100, kcal_per_100g: 900 },
        ],
        total_kcal: 510,
        confidence: "medium",
      });

      const result = parseMealAnalysis(content);
      expect(result.items[0].kcal_per_100g).toBe(150);
      expect(result.items[1].kcal_per_100g).toBeNull();
      expect(result.items[2].kcal_per_100g).toBe(900);
      // New fields default to null when not provided by AI
      expect(result.items[0].volume_ml).toBeNull();
      expect(result.items[0].quantity).toBeNull();
    });

    it("should parse volume_ml and quantity when provided by AI", () => {
      const content = JSON.stringify({
        meal_name: "Soup + Eggs",
        items: [
          {
            name: "Chicken Broth",
            estimated_grams: 240,
            estimated_kcal: 15,
            kcal_per_100g: 62,
            volume_ml: 240,
            quantity: null,
          },
          {
            name: "Hard-boiled Eggs",
            estimated_grams: 140,
            estimated_kcal: 200,
            kcal_per_100g: 143,
            volume_ml: null,
            quantity: 2,
          },
        ],
        total_kcal: 215,
        confidence: "high",
      });

      const result = parseMealAnalysis(content);
      expect(result.items[0].volume_ml).toBe(240);
      expect(result.items[0].quantity).toBeNull();
      expect(result.items[1].volume_ml).toBeNull();
      expect(result.items[1].quantity).toBe(2);
    });

    it("should default volume_ml and quantity to null when not provided", () => {
      const content = JSON.stringify({
        meal_name: "Test",
        items: [
          { name: "Food", estimated_grams: 100, estimated_kcal: 130, kcal_per_100g: 130 },
        ],
        total_kcal: 130,
        confidence: "high",
      });

      const result = parseMealAnalysis(content);
      expect(result.items[0].volume_ml).toBeNull();
      expect(result.items[0].quantity).toBeNull();
    });

    it("should handle empty items array", () => {
      const content = JSON.stringify({
        meal_name: "Empty",
        items: [],
        total_kcal: 0,
        confidence: "low",
      });

      const result = parseMealAnalysis(content);
      expect(result.items).toEqual([]);
      expect(result.total_kcal).toBe(0);
    });

    it("should back-fill estimated_grams when AI returns null but kcal_per_100g is provided", () => {
      const content = JSON.stringify({
        meal_name: "Chicken",
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

      const result = parseMealAnalysis(content);
      expect(result.items[0].estimated_grams).toBe(150); // (165 * 100) / 110 = 150
      expect(result.items[0].volume_ml).toBeNull();
      expect(result.items[0].quantity).toBeNull();
    });

    it("should keep estimated_grams as null when both AI grams and kcal_per_100g are null", () => {
      const content = JSON.stringify({
        meal_name: "Unknown",
        items: [
          {
            name: "Mystery Food",
            estimated_grams: null,
            estimated_kcal: 100,
            kcal_per_100g: null,
          },
        ],
        total_kcal: 100,
        confidence: "low",
      });

      const result = parseMealAnalysis(content);
      expect(result.items[0].estimated_grams).toBeNull();
    });
  });

  describe("computeKcalPer100g", () => {
    it("should compute kcal per 100g from kcal and grams", () => {
      expect(computeKcalPer100g(165, 150)).toBe(110);
    });

    it("should return null when grams is null", () => {
      expect(computeKcalPer100g(165, null)).toBeNull();
    });

    it("should return null when grams is zero", () => {
      expect(computeKcalPer100g(165, 0)).toBeNull();
    });

    it("should round to nearest integer", () => {
      expect(computeKcalPer100g(100, 30)).toBe(333);
    });

    it("should handle 100g exactly", () => {
      expect(computeKcalPer100g(250, 100)).toBe(250);
    });
  });

  describe("getKcalPer100g", () => {
    it("should prefer AI-provided value over computed value", () => {
      expect(getKcalPer100g(165, 330, 150)).toBe(165);
    });

    it("should fall back to computed value when AI value is null", () => {
      expect(getKcalPer100g(null, 165, 150)).toBe(110);
    });

    it("should return null when both AI and computed are unavailable", () => {
      expect(getKcalPer100g(null, 100, null)).toBeNull();
    });

    it("should return null when AI value is null and grams is zero", () => {
      expect(getKcalPer100g(null, 100, 0)).toBeNull();
    });
  });

  describe("computeEstimatedGrams", () => {
    it("should compute grams from kcal and kcal_per_100g", () => {
      expect(computeEstimatedGrams(165, 110)).toBe(150);
    });

    it("should return null when kcal_per_100g is null", () => {
      expect(computeEstimatedGrams(165, null)).toBeNull();
    });

    it("should return null when kcal_per_100g is zero", () => {
      expect(computeEstimatedGrams(165, 0)).toBeNull();
    });

    it("should round to nearest integer", () => {
      expect(computeEstimatedGrams(200, 133)).toBe(150);
    });

    it("should handle 100g exactly", () => {
      expect(computeEstimatedGrams(250, 250)).toBe(100);
    });
  });

  describe("getEstimatedGrams", () => {
    it("should prefer AI-provided grams over computed", () => {
      expect(getEstimatedGrams(150, 165, 110)).toBe(150);
    });

    it("should fall back to computed grams when AI value is null", () => {
      expect(getEstimatedGrams(null, 165, 110)).toBe(150);
    });

    it("should return null when both AI and computed are unavailable", () => {
      expect(getEstimatedGrams(null, 100, null)).toBeNull();
    });

    it("should return null when AI value is null and kcal_per_100g is zero", () => {
      expect(getEstimatedGrams(null, 100, 0)).toBeNull();
    });

    it("should return AI grams even when kcal_per_100g would give a different result", () => {
      // AI says 200g, kcal=330, kcal_per_100g=165 → computed would be 200, same
      expect(getEstimatedGrams(200, 330, 165)).toBe(200);
      // AI says 100g but computed would be 200 — should prefer AI
      expect(getEstimatedGrams(100, 330, 165)).toBe(100);
    });
  });

  describe("bidirectional kcal/grams conversion", () => {
    it("should compute kcal from grams and kcal_per_100g", () => {
      // 150g of food at 165 kcal/100g → 247.5 → 248 kcal
      expect(Math.round((150 * 165) / 100)).toBe(248);
    });

    it("should compute grams from kcal and kcal_per_100g", () => {
      // 248 kcal at 165 kcal/100g → 248*100/165 = 150.3 → 150g
      expect(computeEstimatedGrams(248, 165)).toBe(150);
    });

    it("should round-trip: grams → kcal → grams is consistent", () => {
      const kcalPer100g = 165;
      const originalGrams = 150;
      const kcal = Math.round((originalGrams * kcalPer100g) / 100);
      const roundTripGrams = computeEstimatedGrams(kcal, kcalPer100g);
      expect(roundTripGrams).toBe(originalGrams);
    });

    it("should round-trip: kcal → grams → kcal is consistent", () => {
      const kcalPer100g = 110;
      const originalKcal = 165;
      const grams = computeEstimatedGrams(originalKcal, kcalPer100g);
      expect(grams).not.toBeNull();
      const roundTripKcal = Math.round((grams! * kcalPer100g) / 100);
      expect(roundTripKcal).toBe(originalKcal);
    });
  });
});
