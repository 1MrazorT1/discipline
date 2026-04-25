import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
import { hasIngredientPicker, pickIngredient } from "@/lib/ingredientPicker";
import { ensureProfile } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import type { UserIngredient } from "@/types/database";

const parseKcalPer100g = (value: string) => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export default function IngredientsScreen() {
  const [ingredients, setIngredients] = useState<UserIngredient[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [kcalPer100g, setKcalPer100g] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const pickerMode = hasIngredientPicker();

  const loadIngredients = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    await ensureProfile({
      userId: currentUser.id,
      email: currentUser.email,
    });

    const { data, error } = await supabase
      .from("user_ingredients")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("name", { ascending: true });

    if (error) {
      Alert.alert("Could not load ingredients", error.message);
    } else {
      setIngredients((data ?? []) as UserIngredient[]);
    }

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadIngredients();
    }, [loadIngredients]),
  );

  const filteredIngredients = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return ingredients;

    return ingredients.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(cleanQuery),
    );
  }, [ingredients, query]);

  const saveIngredient = async () => {
    const cleanName = name.trim().replace(/\s+/g, " ");
    const parsedKcal = parseKcalPer100g(kcalPer100g);

    if (!cleanName) {
      Alert.alert("Missing name", "Enter an ingredient name.");
      return;
    }

    if (parsedKcal === null) {
      Alert.alert("Invalid calories", "Enter kcal per 100g as a whole number.");
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;
      if (!currentUser) throw new Error("You need to log in again.");

      const { error } = await supabase.from("user_ingredients").insert({
        user_id: currentUser.id,
        name: cleanName,
        kcal_per_100g: parsedKcal,
      });

      if (error) throw error;

      setName("");
      setKcalPer100g("");
      setQuery("");
      await loadIngredients();
    } catch (error) {
      Alert.alert(
        "Could not save ingredient",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteIngredient = async (ingredientId: string) => {
    const { error } = await supabase.from("user_ingredients").delete().eq("id", ingredientId);
    if (error) {
      Alert.alert("Could not delete ingredient", error.message);
      return;
    }

    setIngredients((currentIngredients) =>
      currentIngredients.filter((ingredient) => ingredient.id !== ingredientId),
    );
  };

  const selectIngredient = (ingredient: UserIngredient) => {
    if (!pickerMode) return;
    pickIngredient(ingredient);
    router.back();
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
          <Text className="text-base font-bold text-ink">Ingredients</Text>
          <View className="h-10 w-10" />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-8 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search ingredients"
            placeholderTextColor="#9a9287"
            className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
          />

          <View className="mt-5 rounded-lg border border-line bg-field p-4">
            <Text className="text-base font-bold text-ink">Save ingredient</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ingredient name"
              placeholderTextColor="#9a9287"
              className="mt-3 rounded-lg border border-line bg-paper px-4 py-3 text-base text-ink"
            />
            <View className="mt-3 flex-row gap-3">
              <TextInput
                value={kcalPer100g}
                onChangeText={setKcalPer100g}
                keyboardType="number-pad"
                placeholder="kcal / 100g"
                placeholderTextColor="#9a9287"
                className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-base text-ink"
              />
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={saveIngredient}
                className="h-12 w-14 items-center justify-center rounded-lg bg-teal"
              >
                {saving ? (
                  <ActivityIndicator color="#fffdf8" />
                ) : (
                  <Ionicons name="add" size={22} color="#fffdf8" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View className="mt-7">
            <Text className="mb-3 text-lg font-bold text-ink">Saved</Text>
            {loading ? (
              <ActivityIndicator color="#2f7f86" />
            ) : filteredIngredients.length === 0 ? (
              <View className="rounded-lg border border-dashed border-line bg-field p-6">
                <Text className="text-center text-sm text-muted">No saved ingredients.</Text>
              </View>
            ) : (
              filteredIngredients.map((ingredient) => (
                <TouchableOpacity
                  key={ingredient.id}
                  activeOpacity={0.85}
                  onPress={() => selectIngredient(ingredient)}
                  className="mb-3 flex-row items-center justify-between rounded-lg border border-line bg-field p-4"
                >
                  <View className="flex-1 pr-4">
                    <Text className="text-base font-semibold text-ink">{ingredient.name}</Text>
                    <Text className="mt-1 text-sm text-muted">
                      {ingredient.kcal_per_100g} kcal / 100g
                    </Text>
                  </View>
                  {pickerMode ? (
                    <Ionicons name="checkmark-circle" size={22} color="#2f7f86" />
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => deleteIngredient(ingredient.id)}
                      className="h-9 w-9 items-center justify-center rounded-full bg-paper"
                    >
                      <Ionicons name="trash-outline" size={18} color="#d95b43" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
