import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareFlatList } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { hasIngredientPicker, pickIngredient } from "@/lib/ingredientPicker";
import { ensureProfile } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { uploadMealPhoto } from "@/lib/upload";
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
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoObjectKey, setPhotoObjectKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<UserIngredient | null>(null);
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

  const parseNutrient = (value: string) => {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

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

    const parsedProtein = parseNutrient(protein);
    const parsedCarbs = parseNutrient(carbs);
    const parsedFat = parseNutrient(fat);

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;
      if (!currentUser) throw new Error("You need to log in again.");

      const insertData: Record<string, unknown> = {
        user_id: currentUser.id,
        name: cleanName,
        kcal_per_100g: parsedKcal,
        protein_g: parsedProtein,
        carbs_g: parsedCarbs,
        fat_g: parsedFat,
      };

      if (photoObjectKey) {
        insertData.photo_url = photoObjectKey;
      }

      if (editingIngredient) {
        const { error } = await supabase
          .from("user_ingredients")
          .update(insertData)
          .eq("id", editingIngredient.id);

        if (error) throw error;

        setIngredients((prev) =>
          prev.map((i) =>
            i.id === editingIngredient.id
              ? { ...i, ...insertData } as UserIngredient
              : i,
          ),
        );
        setEditingIngredient(null);
      } else {
        const { error } = await supabase.from("user_ingredients").insert(insertData);

        if (error) throw error;
      }

      setName("");
      setKcalPer100g("");
      setProtein("");
      setCarbs("");
      setFat("");
      setPhotoUri(null);
      setPhotoObjectKey(null);
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

  const editIngredient = (ingredient: UserIngredient) => {
    setEditingIngredient(ingredient);
    setName(ingredient.name);
    setKcalPer100g(String(ingredient.kcal_per_100g));
    setProtein(ingredient.protein_g != null ? String(ingredient.protein_g) : "");
    setCarbs(ingredient.carbs_g != null ? String(ingredient.carbs_g) : "");
    setFat(ingredient.fat_g != null ? String(ingredient.fat_g) : "");
    setPhotoObjectKey(null);
    setPhotoUri(null);
  };

  const cancelEdit = () => {
    setEditingIngredient(null);
    setName("");
    setKcalPer100g("");
    setProtein("");
    setCarbs("");
    setFat("");
    setPhotoUri(null);
    setPhotoObjectKey(null);
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library.");
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled) return null;
    return result.assets[0];
  };

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
        <Text className="text-base font-bold text-ink">Ingredients</Text>
        <View className="h-10 w-10" />
      </View>

      <KeyboardAwareFlatList
        data={[
          {
            key: "search",
            render: () => (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search ingredients"
                placeholderTextColor="#9a9287"
                className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
              />
            ),
          },
          {
            key: "save-section",
            render: () => (
              <View className="mt-5 rounded-lg border border-line bg-field p-4">
                <Text className="text-base font-bold text-ink">
                  {editingIngredient ? "Edit ingredient" : "Save ingredient"}
                </Text>
                <View className="mt-3 flex-row items-end gap-3">
                  <View className="flex-1">
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="Ingredient name"
                      placeholderTextColor="#9a9287"
                      className="rounded-lg border border-line bg-paper px-4 py-3 text-base text-ink"
                    />
                  </View>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} className="h-12 w-12 rounded-lg" />
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={uploadingPhoto}
                      onPress={async () => {
                        const result = await pickMedia();
                        if (!result) return;
                        setPhotoUri(result.uri);
                        setUploadingPhoto(true);
                        try {
                          const objectKey = await uploadMealPhoto(result.uri);
                          setPhotoObjectKey(objectKey);
                        } catch (e) {
                          Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again.");
                          setPhotoUri(null);
                        } finally {
                          setUploadingPhoto(false);
                        }
                      }}
                      className="h-12 w-12 items-center justify-center rounded-lg border border-line bg-paper"
                    >
                      <Ionicons name="camera-outline" size={20} color="#2f7f86" />
                    </TouchableOpacity>
                  )}
                </View>
                <View className="mt-3 flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text className="text-xs text-muted">kcal / 100g</Text>
                    <TextInput
                      value={kcalPer100g}
                      onChangeText={setKcalPer100g}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor="#9a9287"
                      className="rounded-lg border border-line bg-paper px-4 py-3 text-base text-ink"
                    />
                  </View>
                </View>
                <View className="mt-3 flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-xs text-muted">Protein (g)</Text>
                    <TextInput
                      value={protein}
                      onChangeText={setProtein}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#9a9287"
                      className="rounded-lg border border-line bg-paper px-4 py-3 text-base text-ink"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs text-muted">Carbs (g)</Text>
                    <TextInput
                      value={carbs}
                      onChangeText={setCarbs}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#9a9287"
                      className="rounded-lg border border-line bg-paper px-4 py-3 text-base text-ink"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs text-muted">Fat (g)</Text>
                    <TextInput
                      value={fat}
                      onChangeText={setFat}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#9a9287"
                      className="rounded-lg border border-line bg-paper px-4 py-3 text-base text-ink"
                    />
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={saving}
                  onPress={saveIngredient}
                  className="mt-4 h-12 w-full items-center justify-center rounded-lg bg-teal"
                >
                  {saving ? (
                    <ActivityIndicator color="#fffdf8" />
                  ) : (
                    <Text className="text-base font-semibold text-paper">
                      {editingIngredient ? "Save changes" : "Add ingredient"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ),
          },
          {
            key: "saved-section",
            render: () => (
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
                      onPress={() => (pickerMode ? selectIngredient(ingredient) : editIngredient(ingredient))}
                      className="mb-3 rounded-lg border border-line bg-field p-4"
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 pr-4">
                          <Text className="text-base font-semibold text-ink">{ingredient.name}</Text>
                          <Text className="mt-1 text-sm text-muted">
                            {ingredient.kcal_per_100g} kcal / 100g
                          </Text>
                        </View>
                        {pickerMode ? (
                          <Ionicons name="checkmark-circle" size={22} color="#2f7f86" />
                        ) : editingIngredient?.id === ingredient.id ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={cancelEdit}
                            className="h-8 w-8 items-center justify-center rounded-full bg-paper"
                          >
                            <Ionicons name="close" size={18} color="#d95b43" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={(e) => {
                              e.stopPropagation();
                              Alert.alert(
                                "Delete ingredient",
                                `Remove "${ingredient.name}"?`,
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Delete",
                                    style: "destructive",
                                    onPress: () => deleteIngredient(ingredient.id),
                                  },
                                ],
                              );
                            }}
                            className="h-8 w-8 items-center justify-center rounded-full bg-paper"
                          >
                            <Ionicons name="trash-outline" size={18} color="#d95b43" />
                          </TouchableOpacity>
                        )}
                      </View>
                      {(ingredient.protein_g != null ||
                        ingredient.carbs_g != null ||
                        ingredient.fat_g != null) && (
                        <View className="mt-3 flex-row justify-between">
                          <View className="items-center">
                            <Text className="text-xs text-muted">Protein</Text>
                            <Text className="text-sm font-semibold text-ink">
                              {ingredient.protein_g?.toFixed(1)}g
                            </Text>
                          </View>
                          <View className="items-center">
                            <Text className="text-xs text-muted">Carbs</Text>
                            <Text className="text-sm font-semibold text-ink">
                              {ingredient.carbs_g?.toFixed(1)}g
                            </Text>
                          </View>
                          <View className="items-center">
                            <Text className="text-xs text-muted">Fat</Text>
                            <Text className="text-sm font-semibold text-ink">
                              {ingredient.fat_g?.toFixed(1)}g
                            </Text>
                          </View>
                          <View className="items-center">
                            <Text className="text-xs text-muted">Total</Text>
                            <Text className="text-sm font-semibold text-ink">
                              {(ingredient.protein_g ?? 0) + (ingredient.carbs_g ?? 0) + (ingredient.fat_g ?? 0)}g
                            </Text>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ),
          },
        ]}
        renderItem={({ item }) => item.render()}
        keyExtractor={(item) => item.key}
        contentContainerClassName="px-5 pb-8 pt-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
