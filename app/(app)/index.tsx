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
import { uploadMealPhoto } from "@/lib/upload";
import type { HouseholdMember, MealWithItems } from "@/types/database";

const fallbackColors = ["#3f9c75", "#d95b43"];

export default function HomeScreen() {
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()));
  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
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

    let profile;
    try {
      profile = await ensureProfile({
        userId: currentUser.id,
        email: currentUser.email,
      });
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Profile is missing a household.");
      setLoading(false);
      return;
    }

    if (!profile.household_id) {
      setError("Profile is missing a household.");
      setLoading(false);
      return;
    }

    setHouseholdId(profile.household_id);

    const { data: householdMembers, error: membersError } = await supabase
      .from("profiles")
      .select("id, name, household_id, daily_goal_kcal, color, avatar_url")
      .eq("household_id", profile.household_id)
      .limit(2);

    if (membersError) {
      setError(membersError.message);
      setLoading(false);
      return;
    }

    const { start, end } = dayBounds(selectedDay);
    const { data: dayMeals, error: mealsError } = await supabase
      .from("meals")
      .select("*, meal_items(*)")
      .eq("household_id", profile.household_id)
      .gte("eaten_at", start)
      .lt("eaten_at", end)
      .order("eaten_at", { ascending: false });

    if (mealsError) {
      setError(mealsError.message);
      setLoading(false);
      return;
    }

    const loadedMeals = (dayMeals ?? []) as MealWithItems[];
    setMembers((householdMembers ?? []) as HouseholdMember[]);
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

  const totalsByMember = useMemo(() => {
    return members.map((member) => {
      const total = meals
        .filter((meal) => meal.user_id === member.id)
        .reduce((sum, meal) => sum + meal.total_kcal, 0);

      return { member, total };
    });
  }, [meals, members]);

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

  const handlePickedImage = async (uri?: string) => {
    if (!uri || !userId) return;

    setAnalyzing(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData.user;
      if (!currentUser) throw new Error("You need to log in again.");

      const profile = await ensureProfile({
        userId: currentUser.id,
        email: currentUser.email,
      });

      if (!profile.household_id) {
        throw new Error("Profile is missing a household.");
      }

      setUserId(currentUser.id);
      setHouseholdId(profile.household_id);

      const objectKey = await uploadMealPhoto(uri);
      await analyzeMeal({
        objectKey,
        userId: currentUser.id,
        householdId: profile.household_id,
      });
      await loadData();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Meal analysis failed.";
      Alert.alert("Could not analyze meal", message);
    } finally {
      setAnalyzing(false);
    }
  };

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera permission needed", "Enable camera access to capture meals.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.82,
    });

    if (!result.canceled) await handlePickedImage(result.assets[0]?.uri);
  };

  const openGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Gallery permission needed", "Enable photo access to select meals.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.82,
    });

    if (!result.canceled) await handlePickedImage(result.assets[0]?.uri);
  };

  const totalKcal = meals.reduce((sum, meal) => sum + meal.total_kcal, 0);

  return (
    <SafeAreaView className="flex-1 bg-paper" {...panResponder.panHandlers}>
      <View className="flex-row items-center justify-between px-5 pt-2">
        <View>
          <Text className="text-sm font-semibold uppercase text-muted">Discipline</Text>
          <Text className="mt-1 text-2xl font-bold text-ink">{formatDayTitle(selectedDay)}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push("/(app)/settings")}>
          <AvatarDot
            color={members.find((member) => member.id === userId)?.color}
            label={members.find((member) => member.id === userId)?.name ?? "Me"}
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
            {totalsByMember.slice(0, 2).map(({ member, total }, index) => (
              <View key={member.id} className="absolute">
                <ProgressRing
                  size={index === 0 ? 220 : 166}
                  strokeWidth={14}
                  progress={total / Math.max(member.daily_goal_kcal, 1)}
                  color={member.color ?? fallbackColors[index]}
                />
              </View>
            ))}
            <Text className="text-4xl font-bold text-ink">{totalKcal}</Text>
            <Text className="mt-1 text-sm font-semibold text-muted">kcal logged</Text>
          </View>
        </View>

        <View className="mt-2 flex-row gap-3">
          {totalsByMember.slice(0, 2).map(({ member, total }, index) => (
            <View key={member.id} className="flex-1 rounded-lg border border-line bg-field p-3">
              <View
                className="h-2 w-10 rounded-full"
                style={{ backgroundColor: member.color ?? fallbackColors[index] }}
              />
              <Text className="mt-3 text-sm font-semibold text-ink" numberOfLines={1}>
                {member.name || (member.id === userId ? "You" : "Member")}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {total} / {member.daily_goal_kcal} kcal
              </Text>
            </View>
          ))}
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

      <View className="absolute bottom-0 left-0 right-0 flex-row gap-3 border-t border-line bg-paper px-5 pb-8 pt-4">
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={analyzing}
          onPress={openCamera}
          className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-ink"
        >
          {analyzing ? <ActivityIndicator color="#fffdf8" /> : <Ionicons name="camera" size={21} color="#fffdf8" />}
          <Text className="font-semibold text-white">Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={analyzing}
          onPress={openGallery}
          className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-teal"
        >
          <Ionicons name="images" size={21} color="#fffdf8" />
          <Text className="font-semibold text-white">Gallery</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
