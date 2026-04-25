import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { getSignedPhotoUrl } from "@/lib/meals";
import { supabase } from "@/lib/supabase";
import type { MealItem, MealWithItems, UserIngredient } from "@/types/database";

type EditableItem = {
  clientId: string;
  id?: string;
  name: string;
  grams: string;
  kcal: string;
  kcalPer100g?: number;
};

type InlineDraft = {
  grams: string;
  kcal: string;
};

const confidenceStyle = {
  low: { backgroundColor: "#d95b4324", color: "#d95b43", borderColor: "#d95b4370" },
  medium: { backgroundColor: "#d6a23a24", color: "#b57f20", borderColor: "#d6a23a70" },
  high: { backgroundColor: "#3f9c7524", color: "#2f7f56", borderColor: "#3f9c7570" },
};

const newEditableItem = (): EditableItem => ({
  clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  grams: "",
  kcal: "",
});

const toEditableItem = (item: MealItem): EditableItem => ({
  clientId: item.id,
  id: item.id,
  name: item.name,
  grams: item.estimated_grams === null ? "" : String(item.estimated_grams),
  kcal: String(item.estimated_kcal),
  kcalPer100g:
    item.estimated_grams !== null && item.estimated_grams > 0
      ? (item.estimated_kcal / item.estimated_grams) * 100
      : undefined,
});

const parseKcal = (value: string) => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parseGrams = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
};

const estimateKcal = (grams: string, kcalPer100g: number) => {
  const parsedGrams = parseGrams(grams);
  if (parsedGrams === null || Number.isNaN(parsedGrams)) return "";

  return String(Math.round((parsedGrams * kcalPer100g) / 100));
};

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meal, setMeal] = useState<MealWithItems | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, InlineDraft>>({});
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null);
  const [totalEditing, setTotalEditing] = useState(false);
  const [totalDraft, setTotalDraft] = useState("");
  const [totalSaving, setTotalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeal = async () => {
    setError(null);
    const { data, error: mealError } = await supabase
      .from("meals")
      .select("*, meal_items(*)")
      .eq("id", id)
      .single();

    if (mealError) {
      setError(mealError.message);
      setLoading(false);
      return;
    }

    const loadedMeal = data as MealWithItems;
    setMeal(loadedMeal);
    setTotalDraft(String(loadedMeal.total_kcal));
    setItems(loadedMeal.meal_items.map(toEditableItem));
    setInlineDrafts(
      Object.fromEntries(
        loadedMeal.meal_items.map((item) => [
          item.id,
          {
            grams: item.estimated_grams === null ? "" : String(item.estimated_grams),
            kcal: String(item.estimated_kcal),
          },
        ]),
      ),
    );

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

    setLoading(false);
  };

  useEffect(() => {
    loadMeal();
  }, [id]);

  const calculatedTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const parsed = parseKcal(item.kcal);
        return sum + (parsed ?? 0);
      }, 0),
    [items],
  );

  const updateItem = (clientId: string, patch: Partial<EditableItem>) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.clientId !== clientId) return item;

        const nextItem = { ...item, ...patch };
        if ("grams" in patch && nextItem.kcalPer100g !== undefined) {
          nextItem.kcal = estimateKcal(nextItem.grams, nextItem.kcalPer100g);
        }

        return nextItem;
      }),
    );
  };

  const removeItem = (clientId: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.clientId !== clientId));
  };

  const applyIngredient = (clientId: string, ingredient: UserIngredient) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.clientId !== clientId) return item;

        return {
          ...item,
          name: ingredient.name,
          kcalPer100g: ingredient.kcal_per_100g,
          kcal: estimateKcal(item.grams, ingredient.kcal_per_100g),
        };
      }),
    );
  };

  const openIngredientPicker = (clientId: string) => {
    setIngredientPicker((ingredient) => applyIngredient(clientId, ingredient));
    router.push("/(app)/ingredients");
  };

  const cancelEdit = () => {
    if (!meal) return;
    setItems(meal.meal_items.map(toEditableItem));
    setEditing(false);
  };

  const saveTotalOverride = async () => {
    if (!meal || totalSaving) return;

    const parsedTotal = parseKcal(totalDraft);
    if (parsedTotal === null) {
      Alert.alert("Invalid calories", "Meal total must be a whole number.");
      setTotalDraft(String(meal.total_kcal));
      return;
    }

    if (parsedTotal === meal.total_kcal) {
      setTotalEditing(false);
      return;
    }

    setTotalSaving(true);
    try {
      const { error: mealError } = await supabase
        .from("meals")
        .update({
          total_kcal: parsedTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", meal.id);

      if (mealError) throw mealError;

      setMeal({
        ...meal,
        total_kcal: parsedTotal,
      });
      setTotalEditing(false);
    } catch (saveError) {
      Alert.alert(
        "Could not save total",
        saveError instanceof Error ? saveError.message : "Try again.",
      );
      setTotalDraft(String(meal.total_kcal));
    } finally {
      setTotalSaving(false);
    }
  };

  const startInlineEdit = (item: MealItem) => {
    setInlineEditingId(item.id);
    setInlineDrafts((currentDrafts) => ({
      ...currentDrafts,
      [item.id]: currentDrafts[item.id] ?? {
        grams: item.estimated_grams === null ? "" : String(item.estimated_grams),
        kcal: String(item.estimated_kcal),
      },
    }));
  };

  const updateInlineDraft = (itemId: string, patch: Partial<InlineDraft>) => {
    setInlineDrafts((currentDrafts) => ({
      ...currentDrafts,
      [itemId]: {
        grams: currentDrafts[itemId]?.grams ?? "",
        kcal: currentDrafts[itemId]?.kcal ?? "",
        ...patch,
      },
    }));
  };

  const updateInlineGrams = (item: MealItem, grams: string) => {
    const kcalPer100g =
      item.estimated_grams !== null && item.estimated_grams > 0
        ? (item.estimated_kcal / item.estimated_grams) * 100
        : null;

    updateInlineDraft(item.id, {
      grams,
      ...(kcalPer100g === null ? {} : { kcal: estimateKcal(grams, kcalPer100g) }),
    });
  };

  const saveInlineItem = async (itemId: string) => {
    if (!meal || inlineSavingId === itemId) return;

    const draft = inlineDrafts[itemId];
    const existingItem = meal.meal_items.find((item) => item.id === itemId);
    if (!draft || !existingItem) return;

    const parsedGrams = parseGrams(draft.grams);
    const parsedItemKcal = parseKcal(draft.kcal);

    if (Number.isNaN(parsedGrams)) {
      Alert.alert("Invalid grams", "Item grams must be a positive number.");
      updateInlineDraft(itemId, {
        grams: existingItem.estimated_grams === null ? "" : String(existingItem.estimated_grams),
      });
      return;
    }

    if (parsedItemKcal === null) {
      Alert.alert("Invalid calories", "Item calories must be a whole number.");
      updateInlineDraft(itemId, { kcal: String(existingItem.estimated_kcal) });
      return;
    }

    if (
      parsedGrams === existingItem.estimated_grams &&
      parsedItemKcal === existingItem.estimated_kcal
    ) {
      return;
    }

    const nextItems = meal.meal_items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            estimated_grams: parsedGrams,
            estimated_kcal: parsedItemKcal,
            updated_at: new Date().toISOString(),
          }
        : item,
    );
    const nextTotal = nextItems.reduce((sum, item) => sum + item.estimated_kcal, 0);

    setInlineSavingId(itemId);
    try {
      const { error: itemError } = await supabase
        .from("meal_items")
        .update({
          estimated_grams: parsedGrams,
          estimated_kcal: parsedItemKcal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);

      if (itemError) throw itemError;

      const { error: mealError } = await supabase
        .from("meals")
        .update({
          total_kcal: nextTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", meal.id);

      if (mealError) throw mealError;

      setMeal({
        ...meal,
        total_kcal: nextTotal,
        meal_items: nextItems,
      });
      setTotalDraft(String(nextTotal));
      setItems(nextItems.map(toEditableItem));
    } catch (saveError) {
      Alert.alert(
        "Could not save item",
        saveError instanceof Error ? saveError.message : "Try again.",
      );
      updateInlineDraft(itemId, {
        grams: existingItem.estimated_grams === null ? "" : String(existingItem.estimated_grams),
        kcal: String(existingItem.estimated_kcal),
      });
    } finally {
      setInlineSavingId(null);
    }
  };

  const saveItems = async () => {
    if (!meal) return;

    const parsedItems = [];
    for (const item of items) {
      const cleanName = item.name.trim().replace(/\s+/g, " ");
      const parsedGrams = parseGrams(item.grams);
      const parsedItemKcal = parseKcal(item.kcal);

      if (!cleanName) {
        Alert.alert("Missing item name", "Every item needs a name.");
        return;
      }

      if (Number.isNaN(parsedGrams)) {
        Alert.alert("Invalid grams", "Item grams must be a positive number.");
        return;
      }

      if (parsedItemKcal === null) {
        Alert.alert("Invalid calories", "Every item needs calories as a whole number.");
        return;
      }

      parsedItems.push({
        id: item.id,
        name: cleanName,
        estimated_grams: parsedGrams,
        estimated_kcal: parsedItemKcal,
      });
    }

    setSaving(true);
    try {
      const keptIds = new Set(parsedItems.map((item) => item.id).filter(Boolean));
      const deletedIds = meal.meal_items
        .map((item) => item.id)
        .filter((itemId) => !keptIds.has(itemId));

      if (deletedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("meal_items")
          .delete()
          .in("id", deletedIds);

        if (deleteError) throw deleteError;
      }

      for (const item of parsedItems) {
        if (item.id) {
          const { error: updateError } = await supabase
            .from("meal_items")
            .update({
              name: item.name,
              estimated_grams: item.estimated_grams,
              estimated_kcal: item.estimated_kcal,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from("meal_items").insert({
            meal_id: meal.id,
            name: item.name,
            estimated_grams: item.estimated_grams,
            estimated_kcal: item.estimated_kcal,
          });

          if (insertError) throw insertError;
        }
      }

      const { error: mealError } = await supabase
        .from("meals")
        .update({
          total_kcal: calculatedTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", meal.id);

      if (mealError) throw mealError;

      setEditing(false);
      await loadMeal();
    } catch (saveError) {
      Alert.alert(
        "Could not save meal",
        saveError instanceof Error ? saveError.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteMeal = async () => {
    if (!meal || deleting) return;

    Alert.alert(
      "Delete meal?",
      "This will remove the meal and its item breakdown.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const { error: mealError } = await supabase
                .from("meals")
                .delete()
                .eq("id", meal.id);

              if (mealError) throw mealError;

              if (meal.photo_url) {
                const { error: photoError } = await supabase.storage
                  .from("meal-photos")
                  .remove([meal.photo_url]);

                if (photoError) {
                  console.warn("Meal photo cleanup failed:", photoError.message);
                }
              }

              router.replace("/");
            } catch (deleteError) {
              Alert.alert(
                "Could not delete meal",
                deleteError instanceof Error ? deleteError.message : "Try again.",
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
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
            onPress={() => (editing ? cancelEdit() : router.back())}
            className="h-10 w-10 items-center justify-center rounded-full bg-field"
          >
            <Ionicons name={editing ? "close" : "chevron-back"} size={22} color="#24211d" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-ink">Meal</Text>
          {meal && !editing ? (
            <View className="flex-row gap-2">
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={deleting}
                onPress={deleteMeal}
                className="h-10 w-10 items-center justify-center rounded-full bg-field"
              >
                {deleting ? (
                  <ActivityIndicator color="#d95b43" />
                ) : (
                  <Ionicons name="trash-outline" size={20} color="#d95b43" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={deleting}
                onPress={() => setEditing(true)}
                className="h-10 w-10 items-center justify-center rounded-full bg-field"
              >
                <Ionicons name="create-outline" size={20} color="#24211d" />
              </TouchableOpacity>
            </View>
          ) : (
            <View className="h-10 w-10" />
          )}
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
          <ScrollView
            contentContainerClassName="px-5 pb-8"
            keyboardShouldPersistTaps="handled"
          >
            {photoLoading ? (
              <View className="h-72 w-full items-center justify-center rounded-lg bg-line">
                <ActivityIndicator color="#2f7f86" />
              </View>
            ) : signedUrl ? (
              <Image source={{ uri: signedUrl }} className="h-72 w-full rounded-lg bg-line" />
            ) : (
              <View className="h-72 w-full items-center justify-center rounded-lg bg-line">
                <Ionicons name="restaurant-outline" size={34} color="#9a9287" />
              </View>
            )}

            <View className="mt-5 flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="text-3xl font-bold text-ink">{meal.meal_name}</Text>
                <Text className="mt-2 text-sm text-muted">
                  {editing ? "Total from items" : "Total estimate"}
                </Text>
              </View>
              <View
                className="rounded-full border px-3 py-1"
                style={{
                  backgroundColor: confidenceStyle[meal.confidence].backgroundColor,
                  borderColor: confidenceStyle[meal.confidence].borderColor,
                }}
              >
                <Text
                  className="text-xs font-bold uppercase"
                  style={{ color: confidenceStyle[meal.confidence].color }}
                >
                  {meal.confidence}
                </Text>
              </View>
            </View>

            {editing ? (
              <Text className="mt-2 text-4xl font-bold text-teal">{calculatedTotal} kcal</Text>
            ) : totalEditing ? (
              <View className="mt-3 rounded-lg border border-line bg-field p-4">
                <Text className="mb-2 text-sm font-semibold text-ink">Meal total</Text>
                <View className="flex-row items-center gap-3">
                  <TextInput
                    value={totalDraft}
                    onChangeText={setTotalDraft}
                    onBlur={saveTotalOverride}
                    onSubmitEditing={saveTotalOverride}
                    keyboardType="number-pad"
                    placeholder="Total kcal"
                    placeholderTextColor="#9a9287"
                    className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-xl font-bold text-teal"
                  />
                  <Text className="text-base font-bold text-teal">kcal</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={totalSaving}
                    onPress={saveTotalOverride}
                    className="h-12 w-12 items-center justify-center rounded-full bg-teal"
                  >
                    {totalSaving ? (
                      <ActivityIndicator color="#fffdf8" />
                    ) : (
                      <Ionicons name="checkmark" size={22} color="#fffdf8" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setTotalDraft(String(meal.total_kcal));
                  setTotalEditing(true);
                }}
                className="mt-2 flex-row items-center gap-2"
              >
                <Text className="text-4xl font-bold text-teal">{meal.total_kcal} kcal</Text>
                <Ionicons name="create-outline" size={19} color="#2f7f86" />
              </TouchableOpacity>
            )}

            <View className="mt-7">
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-lg font-bold text-ink">Item breakdown</Text>
                {editing ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setItems((currentItems) => [...currentItems, newEditableItem()])}
                    className="h-10 w-10 items-center justify-center rounded-full bg-teal"
                  >
                    <Ionicons name="add" size={22} color="#fffdf8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {editing ? (
                items.length === 0 ? (
                  <View className="rounded-lg border border-line bg-field p-4">
                    <Text className="text-sm text-muted">Add at least one item to recalculate the total.</Text>
                  </View>
                ) : (
                  items.map((item, index) => (
                    <View
                      key={item.clientId}
                      className="mb-3 rounded-lg border p-4"
                      style={{ backgroundColor: "#2f7f8610", borderColor: "#2f7f8630" }}
                    >
                      <View className="mb-3 flex-row items-center justify-between">
                        <Text className="text-sm font-bold text-ink">Item {index + 1}</Text>
                        <View className="flex-row gap-2">
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => openIngredientPicker(item.clientId)}
                            className="h-9 w-9 items-center justify-center rounded-full bg-paper"
                          >
                            <Ionicons name="search" size={18} color="#2f7f86" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => removeItem(item.clientId)}
                            className="h-9 w-9 items-center justify-center rounded-full bg-paper"
                          >
                            <Ionicons name="trash-outline" size={18} color="#d95b43" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <TextInput
                        value={item.name}
                        onChangeText={(value) => updateItem(item.clientId, { name: value })}
                        placeholder="Item name"
                        placeholderTextColor="#9a9287"
                        className="rounded-lg border border-line bg-paper px-4 py-3 text-base text-ink"
                      />

                      <View className="mt-3 flex-row gap-3">
                        <TextInput
                          value={item.grams}
                          onChangeText={(value) => updateItem(item.clientId, { grams: value })}
                          keyboardType="decimal-pad"
                          placeholder="Grams"
                          placeholderTextColor="#9a9287"
                          className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-base text-ink"
                        />
                        <TextInput
                          value={item.kcal}
                          onChangeText={(value) => updateItem(item.clientId, { kcal: value })}
                          keyboardType="number-pad"
                          placeholder="Kcal"
                          placeholderTextColor="#9a9287"
                          className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-base text-ink"
                        />
                      </View>
                    </View>
                  ))
                )
              ) : meal.meal_items.length === 0 ? (
                <View className="rounded-lg border border-line bg-field p-4">
                  <Text className="text-sm text-muted">No individual items logged.</Text>
                </View>
              ) : (
                meal.meal_items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.85}
                    onPress={() => startInlineEdit(item)}
                    className="mb-3 rounded-lg border p-4"
                    style={{ backgroundColor: "#3f9c7510", borderColor: "#3f9c7530" }}
                  >
                    {inlineEditingId === item.id ? (
                      <>
                        <View className="mb-3 flex-row items-center justify-between gap-3">
                          <View className="flex-1">
                            <Text className="text-base font-semibold text-ink">{item.name}</Text>
                            <Text className="mt-1 text-xs text-muted">Changes save automatically</Text>
                          </View>
                          {inlineSavingId === item.id ? (
                            <ActivityIndicator color="#2f7f86" />
                          ) : (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => {
                                saveInlineItem(item.id);
                                setInlineEditingId(null);
                              }}
                              className="h-9 w-9 items-center justify-center rounded-full bg-paper"
                            >
                              <Ionicons name="checkmark" size={20} color="#2f7f86" />
                            </TouchableOpacity>
                          )}
                        </View>

                        <View className="flex-row gap-3">
                          <TextInput
                            value={inlineDrafts[item.id]?.grams ?? ""}
                            onChangeText={(value) => updateInlineGrams(item, value)}
                            onBlur={() => saveInlineItem(item.id)}
                            onSubmitEditing={() => saveInlineItem(item.id)}
                            keyboardType="decimal-pad"
                            placeholder="Grams"
                            placeholderTextColor="#9a9287"
                            className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-base text-ink"
                          />
                          <TextInput
                            value={inlineDrafts[item.id]?.kcal ?? ""}
                            onChangeText={(value) => updateInlineDraft(item.id, { kcal: value })}
                            onBlur={() => saveInlineItem(item.id)}
                            onSubmitEditing={() => saveInlineItem(item.id)}
                            keyboardType="number-pad"
                            placeholder="Kcal"
                            placeholderTextColor="#9a9287"
                            className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-base text-ink"
                          />
                        </View>
                      </>
                    ) : (
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 pr-4">
                          <Text className="text-base font-semibold text-ink">{item.name}</Text>
                          <Text className="mt-1 text-sm text-muted">
                            {item.estimated_grams === null ? "Portion estimated" : `${item.estimated_grams} g`}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-base font-bold text-ink">{item.estimated_kcal} kcal</Text>
                          <Ionicons name="create-outline" size={16} color="#9a9287" />
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>

            {editing ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={saveItems}
                className="mt-5 h-14 items-center justify-center rounded-lg bg-teal"
              >
                {saving ? (
                  <ActivityIndicator color="#fffdf8" />
                ) : (
                  <Text className="text-base font-semibold text-white">Save changes</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
