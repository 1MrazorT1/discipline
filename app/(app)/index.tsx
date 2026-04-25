import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AvatarDot } from "@/components/AvatarDot";
import { MealFeedRow } from "@/components/MealFeedRow";
import { ProgressRing } from "@/components/ProgressRing";
import { addDays, dayBounds, formatDayTitle, startOfDay } from "@/lib/dates";
import { analyzeMeal, getSignedPhotoUrls } from "@/lib/meals";
import { ensureProfile } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { uploadMealPhotos } from "@/lib/upload";
import type { DailyProfile, MealWithItems } from "@/types/database";

const getProgressColor = (progress: number) => {
  if (progress > 1) return "#d95b43";
  if (progress > 0.85) return "#d6a23a";
  if (progress > 0.45) return "#3f9c75";
  return "#2f7f86";
};

export default function HomeScreen() {
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()));
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<DailyProfile | null>(null);
  const [meals, setMeals] = useState<MealWithItems[]>([]);
  const [signedPhotoUrls, setSignedPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setUserId(currentUser.id);

    let loadedProfile;
    try {
      loadedProfile = await ensureProfile({
        userId: currentUser.id,
        email: currentUser.email,
      });
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Could not load profile.");
      setLoading(false);
      return;
    }

    setProfile(loadedProfile);

    const { start, end } = dayBounds(selectedDay);
    const { data: dayMeals, error: mealsError } = await supabase
      .from("meals")
      .select("*, meal_items(*)")
      .eq("user_id", currentUser.id)
      .gte("eaten_at", start)
      .lt("eaten_at", end)
      .order("eaten_at", { ascending: false });

    if (mealsError) {
      setError(mealsError.message);
      setLoading(false);
      return;
    }

    const loadedMeals = (dayMeals ?? []) as MealWithItems[];
    setMeals(loadedMeals);

    const objectKeys = loadedMeals
      .map((meal) => meal.photo_url)
      .filter((objectKey): objectKey is string => Boolean(objectKey));

    try {
      setSignedPhotoUrls(await getSignedPhotoUrls(objectKeys));
    } catch {
      setSignedPhotoUrls({});
    }

    setLoading(false);
  }, [selectedDay]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData]),
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 28 && Math.abs(gesture.dy) < 18,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx < -60) setSelectedDay((day) => addDays(day, 1));
          if (gesture.dx > 60) setSelectedDay((day) => addDays(day, -1));
        },
      }),
    [],
  );

  const handlePickedImages = async (uris: string[]) => {
    const limitedUris = uris.filter(Boolean).slice(0, 3);
    if (limitedUris.length === 0 || !userId) return;

    setAnalyzing(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;
      if (!currentUser) throw new Error("You need to log in again.");

      const currentProfile = await ensureProfile({
        userId: currentUser.id,
        email: currentUser.email,
      });

      setUserId(currentUser.id);
      setProfile(currentProfile);

      const objectKeys = await uploadMealPhotos(limitedUris);
      await analyzeMeal({
        objectKeys,
        userId: currentUser.id,
      });
      await loadData();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Meal analysis failed.";
      Alert.alert("Could not analyze meal", message);
    } finally {
      setAnalyzing(false);
    }
  };

  const askForAnotherPhoto = () =>
    new Promise<boolean>((resolve) => {
      Alert.alert("Add another photo?", "You can attach up to 3 photos for this meal.", [
        { text: "Analyze now", style: "cancel", onPress: () => resolve(false) },
        { text: "Add photo", onPress: () => resolve(true) },
      ]);
    });

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera permission needed", "Enable camera access to capture meals.");
      return;
    }

    const uris: string[] = [];
    while (uris.length < 3) {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.82,
      });

      if (result.canceled) break;

      const uri = result.assets[0]?.uri;
      if (uri) uris.push(uri);

      if (uris.length >= 3) break;
      const addAnother = await askForAnotherPhoto();
      if (!addAnother) break;
    }

    await handlePickedImages(uris);
  };

  const openGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Gallery permission needed", "Enable photo access to select meals.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.82,
    });

    if (!result.canceled) {
      await handlePickedImages(result.assets.map((asset) => asset.uri));
    }
  };

  const totalKcal = meals.reduce((sum, meal) => sum + meal.total_kcal, 0);
  const dailyGoal = profile?.daily_goal_kcal ?? 2000;
  const progress = totalKcal / Math.max(dailyGoal, 1);
  const progressColor = getProgressColor(progress);

  return (
    <SafeAreaView className="flex-1 bg-paper" {...panResponder.panHandlers}>
      <View className="flex-row items-center justify-between px-5 pt-2">
        <View>
          <Text className="text-sm font-semibold uppercase text-muted">Discipline</Text>
          <Text className="mt-1 text-2xl font-bold text-ink">{formatDayTitle(selectedDay)}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push("/(app)/settings")}>
          <AvatarDot
            color={profile?.color}
            label={profile?.name ?? "Me"}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28 pt-5"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} />}
      >
        <View className="items-center justify-center py-4">
          <View className="h-56 w-56 items-center justify-center">
            <View className="absolute">
              <ProgressRing
                size={220}
                strokeWidth={14}
                progress={progress}
                color={progressColor}
              />
            </View>
            <Text className="text-4xl font-bold" style={{ color: progressColor }}>
              {totalKcal}
            </Text>
            <Text className="mt-1 text-sm font-semibold text-muted">kcal logged</Text>
          </View>
        </View>

        <View
          className="mt-2 rounded-lg border p-4"
          style={{ backgroundColor: `${progressColor}14`, borderColor: `${progressColor}55` }}
        >
          <View
            className="h-2 w-10 rounded-full"
            style={{ backgroundColor: progressColor }}
          />
          <Text className="mt-3 text-sm font-semibold text-ink" numberOfLines={1}>
            {profile?.name || "You"}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            {totalKcal} / {dailyGoal} kcal
          </Text>
        </View>

        {error ? <Text className="mt-5 text-sm text-tomato">{error}</Text> : null}

        <View className="mt-6">
          <Text className="mb-3 text-lg font-bold text-ink">Meals</Text>
          {loading && meals.length === 0 ? (
            <ActivityIndicator color="#2f7f86" />
          ) : meals.length === 0 ? (
            <View className="rounded-lg border border-dashed border-line bg-field p-6">
              <Text className="text-center text-sm text-muted">No meals logged for this day.</Text>
            </View>
          ) : (
            meals.map((meal) => (
              <MealFeedRow
                key={meal.id}
                meal={meal}
                signedUrl={meal.photo_url ? signedPhotoUrls[meal.photo_url] : undefined}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/meal/[id]",
                    params: { id: meal.id },
                  })
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 flex-row gap-2 border-t border-line bg-paper px-5 pb-8 pt-4">
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={analyzing}
          onPress={openCamera}
          className="h-14 flex-1 items-center justify-center rounded-lg bg-ink"
        >
          {analyzing ? <ActivityIndicator color="#fffdf8" /> : <Ionicons name="camera" size={21} color="#fffdf8" />}
          <Text className="mt-1 text-xs font-semibold text-white">Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={analyzing}
          onPress={openGallery}
          className="h-14 flex-1 items-center justify-center rounded-lg bg-teal"
        >
          <Ionicons name="images" size={21} color="#fffdf8" />
          <Text className="mt-1 text-xs font-semibold text-white">Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={analyzing}
          onPress={() => router.push("/(app)/log-manual")}
          className="h-14 flex-1 items-center justify-center rounded-lg bg-mint"
        >
          <Ionicons name="add" size={22} color="#fffdf8" />
          <Text className="mt-1 text-xs font-semibold text-white">Manual</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
