import { Image, Text, TouchableOpacity, View } from "react-native";
import { formatTime } from "@/lib/dates";
import type { MealWithItems } from "@/types/database";

type MealFeedRowProps = {
  meal: MealWithItems;
  signedUrl?: string;
  onPress: () => void;
};

const getMealAccent = (eatenAt: string) => {
  const hour = new Date(eatenAt).getHours();
  if (hour < 11) return { color: "#d6a23a", label: "Morning" };
  if (hour < 16) return { color: "#2f7f86", label: "Midday" };
  if (hour < 21) return { color: "#d95b43", label: "Evening" };
  return { color: "#6d6bb3", label: "Late" };
};

const confidenceColor = {
  low: "#d95b43",
  medium: "#d6a23a",
  high: "#3f9c75",
};

export function MealFeedRow({ meal, signedUrl, onPress }: MealFeedRowProps) {
  const accent = getMealAccent(meal.eaten_at);

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      className="mb-3 flex-row items-center overflow-hidden rounded-lg border border-line bg-field p-3"
    >
      <View className="absolute bottom-0 left-0 top-0 w-1.5" style={{ backgroundColor: accent.color }} />
      {signedUrl ? (
        <Image source={{ uri: signedUrl }} className="ml-1 h-16 w-16 rounded-md bg-line" />
      ) : (
        <View className="ml-1 h-16 w-16 items-center justify-center rounded-md bg-line">
          <View className="h-8 w-8 rounded-full" style={{ backgroundColor: accent.color }} />
        </View>
      )}
      <View className="ml-3 flex-1">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
            {meal.meal_name}
          </Text>
          <Text className="text-sm font-bold" style={{ color: accent.color }}>
            {meal.total_kcal} kcal
          </Text>
        </View>
        <Text className="mt-1 text-sm text-muted" numberOfLines={1}>
          {meal.meal_items.map((item) => item.name).join(", ") || "No items"}
        </Text>
        <View className="mt-2 flex-row items-center gap-2">
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: `${accent.color}22` }}
          >
            <Text className="text-xs font-bold" style={{ color: accent.color }}>
              {accent.label}
            </Text>
          </View>
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: `${confidenceColor[meal.confidence]}22` }}
          >
            <Text className="text-xs font-bold" style={{ color: confidenceColor[meal.confidence] }}>
              {meal.confidence}
            </Text>
          </View>
          <Text className="text-xs text-muted">{formatTime(meal.eaten_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
