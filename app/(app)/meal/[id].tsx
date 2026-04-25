import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSignedPhotoUrl } from "@/lib/meals";
import { supabase } from "@/lib/supabase";
import type { MealWithItems } from "@/types/database";

const confidenceStyle = {
  low: "bg-tomato",
  medium: "bg-gold",
  high: "bg-mint",
};

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meal, setMeal] = useState<MealWithItems | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMeal = async () => {
      const { data, error: mealError } = await supabase
        .from("meals")
        .select("*, meal_items(*)")
        .eq("id", id)
        .single();

      if (mealError) {
        setError(mealError.message);
      } else {
        const loadedMeal = data as MealWithItems;
        setMeal(loadedMeal);

        if (loadedMeal.photo_url) {
          setPhotoLoading(true);
          try {
            setSignedUrl(await getSignedPhotoUrl(loadedMeal.photo_url));
          } catch (photoError) {
            setError(photoError instanceof Error ? photoError.message : "Could not load meal photo.");
          } finally {
            setPhotoLoading(false);
          }
        }
      }

      setLoading(false);
    };

    loadMeal();
  }, [id]);

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-row items-center justify-between px-5 py-3">
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-field"
        >
          <Ionicons name="chevron-back" size={22} color="#24211d" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-ink">Meal</Text>
        <View className="h-10 w-10" />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2f7f86" />
        </View>
      ) : error || !meal ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-center text-sm text-tomato">{error ?? "Meal not found."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-8">
          {photoLoading ? (
            <View className="h-72 w-full items-center justify-center rounded-lg bg-line">
              <ActivityIndicator color="#2f7f86" />
            </View>
          ) : signedUrl ? (
            <Image source={{ uri: signedUrl }} className="h-72 w-full rounded-lg bg-line" />
          ) : (
            <View className="h-72 w-full rounded-lg bg-line" />
          )}

          <View className="mt-5 flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-3xl font-bold text-ink">{meal.meal_name}</Text>
              <Text className="mt-2 text-sm text-muted">Total estimate</Text>
            </View>
            <View className={`rounded-full px-3 py-1 ${confidenceStyle[meal.confidence]}`}>
              <Text className="text-xs font-bold uppercase text-white">{meal.confidence}</Text>
            </View>
          </View>

          <Text className="mt-2 text-4xl font-bold text-teal">{meal.total_kcal} kcal</Text>

          <View className="mt-7">
            <Text className="mb-3 text-lg font-bold text-ink">Item breakdown</Text>
            {meal.meal_items.map((item) => (
              <View
                key={item.id}
                className="mb-3 flex-row items-center justify-between rounded-lg border border-line bg-field p-4"
              >
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-ink">{item.name}</Text>
                  <Text className="mt-1 text-sm text-muted">
                    {item.estimated_grams === null ? "Portion estimated" : `${item.estimated_grams} g`}
                  </Text>
                </View>
                <Text className="text-base font-bold text-ink">{item.estimated_kcal} kcal</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
