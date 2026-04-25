import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { setIngredientPicker } from "@/lib/ingredientPicker";
import { ensureProfile } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import type { UserIngredient } from "@/types/database";

type ManualItemInput = {
  id: string;
  name: string;
  grams: string;
  kcal: string;
  kcalPer100g?: number;
};

const newItem = (): ManualItemInput => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  grams: "",
  kcal: "",
});

const parsePositiveInteger = (value: string) => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parseOptionalGrams = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
};

const estimateKcal = (grams: string, kcalPer100g: number) => {
  const parsedGrams = parseOptionalGrams(grams);
  if (parsedGrams === null || Number.isNaN(parsedGrams)) return "";

  return String(Math.round((parsedGrams * kcalPer100g) / 100));
};

export default function ManualLogScreen() {
  const [mealName, setMealName] = useState("");
  const [totalKcal, setTotalKcal] = useState("");
  const [items, setItems] = useState<ManualItemInput[]>([newItem()]);
  const [saving, setSaving] = useState(false);

  const updateItem = (id: string, patch: Partial<ManualItemInput>) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== id) return item;

        const nextItem = { ...item, ...patch };
        if ("grams" in patch && nextItem.kcalPer100g !== undefined) {
          nextItem.kcal = estimateKcal(nextItem.grams, nextItem.kcalPer100g);
        }

        return nextItem;
      }),
    );
  };

  const removeItem = (id: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== id));
  };

  const applyIngredient = (itemId: string, ingredient: UserIngredient) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) return item;

        return {
          ...item,
          name: ingredient.name,
          kcalPer100g: ingredient.kcal_per_100g,
          kcal: estimateKcal(item.grams, ingredient.kcal_per_100g),
        };
      }),
    );
  };

  const openIngredientPicker = (itemId: string) => {
    setIngredientPicker((ingredient) => applyIngredient(itemId, ingredient));
    router.push("/(app)/ingredients");
  };

  const saveMeal = async () => {
    const cleanMealName = mealName.trim().replace(/\s+/g, " ");
    const parsedTotalKcal = parsePositiveInteger(totalKcal);

    if (!cleanMealName) {
      Alert.alert("Missing meal name", "Enter a meal name.");
      return;
    }

    if (parsedTotalKcal === null) {
      Alert.alert("Invalid calories", "Enter total calories as a whole number.");
      return;
    }

    const filledItems = items.filter(
      (item) => item.name.trim() || item.grams.trim() || item.kcal.trim(),
    );

    const parsedItems = [];
    for (const item of filledItems) {
      const cleanName = item.name.trim().replace(/\s+/g, " ");
      const parsedGrams = parseOptionalGrams(item.grams);
      const parsedKcal = parsePositiveInteger(item.kcal);

      if (!cleanName) {
        Alert.alert("Missing item name", "Every item with calories or grams needs a name.");
        return;
      }

      if (Number.isNaN(parsedGrams)) {
        Alert.alert("Invalid grams", "Item grams must be a positive number.");
        return;
      }

      if (parsedKcal === null) {
        Alert.alert("Invalid item calories", "Each item needs calories as a whole number.");
        return;
      }

      parsedItems.push({
        name: cleanName,
        estimated_grams: parsedGrams,
        estimated_kcal: parsedKcal,
      });
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;
      if (!currentUser) throw new Error("You need to log in again.");

      await ensureProfile({
        userId: currentUser.id,
        email: currentUser.email,
      });

      const { data: meal, error: mealError } = await supabase
        .from("meals")
        .insert({
          photo_url: null,
          total_kcal: parsedTotalKcal,
          confidence: "high",
          meal_name: cleanMealName,
          user_id: currentUser.id,
        })
        .select()
        .single();

      if (mealError || !meal) {
        throw mealError ?? new Error("Could not create meal.");
      }

      if (parsedItems.length > 0) {
        const { error: itemsError } = await supabase.from("meal_items").insert(
          parsedItems.map((item) => ({
            meal_id: meal.id,
            ...item,
          })),
        );

        if (itemsError) {
          await supabase.from("meals").delete().eq("id", meal.id);
          throw itemsError;
        }
      }

      router.replace("/");
    } catch (error) {
      Alert.alert(
        "Could not save meal",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-row items-center justify-between px-5 py-3">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-field"
          >
            <Ionicons name="chevron-back" size={22} color="#24211d" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-ink">Manual meal</Text>
          <View className="h-10 w-10" />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-8 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="mb-2 text-sm font-semibold text-ink">Meal name</Text>
          <TextInput
            value={mealName}
            onChangeText={setMealName}
            placeholder="Chicken rice bowl"
            placeholderTextColor="#9a9287"
            className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
          />

          <Text className="mb-2 mt-5 text-sm font-semibold text-ink">Total calories</Text>
          <TextInput
            value={totalKcal}
            onChangeText={setTotalKcal}
            keyboardType="number-pad"
            placeholder="650"
            placeholderTextColor="#9a9287"
            className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
          />

          <View className="mt-7 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">Items</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setItems((currentItems) => [...currentItems, newItem()])}
              className="h-10 w-10 items-center justify-center rounded-full bg-teal"
            >
              <Ionicons name="add" size={22} color="#fffdf8" />
            </TouchableOpacity>
          </View>

          {items.map((item, index) => (
            <View key={item.id} className="mt-4 rounded-lg border border-line bg-field p-4">
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-ink">Item {index + 1}</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => openIngredientPicker(item.id)}
                    className="h-9 w-9 items-center justify-center rounded-full bg-paper"
                  >
                    <Ionicons name="search" size={18} color="#2f7f86" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => removeItem(item.id)}
                    className="h-9 w-9 items-center justify-center rounded-full bg-paper"
                  >
                    <Ionicons name="trash-outline" size={18} color="#d95b43" />
                  </TouchableOpacity>
                </View>
              </View>

              <TextInput
                value={item.name}
                onChangeText={(value) => updateItem(item.id, { name: value })}
                placeholder="Item name"
                placeholderTextColor="#9a9287"
                className="rounded-lg border border-line bg-paper px-4 py-3 text-base text-ink"
              />

              <View className="mt-3 flex-row gap-3">
                <TextInput
                  value={item.grams}
                  onChangeText={(value) => updateItem(item.id, { grams: value })}
                  keyboardType="decimal-pad"
                  placeholder="Grams"
                  placeholderTextColor="#9a9287"
                  className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-base text-ink"
                />
                <TextInput
                  value={item.kcal}
                  onChangeText={(value) => updateItem(item.id, { kcal: value })}
                  keyboardType="number-pad"
                  placeholder="Kcal"
                  placeholderTextColor="#9a9287"
                  className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-base text-ink"
                />
              </View>
            </View>
          ))}

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={saving}
            onPress={saveMeal}
            className="mt-8 h-14 items-center justify-center rounded-lg bg-tomato"
          >
            {saving ? (
              <ActivityIndicator color="#fffdf8" />
            ) : (
              <Text className="text-base font-semibold text-white">Save meal</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
