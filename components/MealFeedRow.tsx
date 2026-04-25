import { Image, Text, TouchableOpacity, View } from "react-native";
import { formatTime } from "@/lib/dates";
import type { MealWithItems } from "@/types/database";

type MealFeedRowProps = {
  meal: MealWithItems;
  signedUrl?: string;
  onPress: () => void;
};

export function MealFeedRow({ meal, signedUrl, onPress }: MealFeedRowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      className="mb-3 flex-row items-center rounded-lg border border-line bg-field p-3"
    >
      {signedUrl ? (
        <Image source={{ uri: signedUrl }} className="h-16 w-16 rounded-md bg-line" />
      ) : (
        <View className="h-16 w-16 rounded-md bg-line" />
      )}
      <View className="ml-3 flex-1">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
            {meal.meal_name}
          </Text>
          <Text className="text-sm font-semibold text-teal">{meal.total_kcal} kcal</Text>
        </View>
        <Text className="mt-1 text-sm text-muted" numberOfLines={1}>
          {meal.meal_items.map((item) => item.name).join(", ") || "No items"}
        </Text>
        <Text className="mt-1 text-xs text-muted">{formatTime(meal.eaten_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}
