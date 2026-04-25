import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
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
import { AvatarDot } from "@/components/AvatarDot";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types/database";

const colors = ["#3f9c75", "#d95b43", "#2f7f86", "#d6a23a", "#6d6bb3"];

export default function SettingsScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [dailyGoal, setDailyGoal] = useState("2000");
  const [color, setColor] = useState(colors[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        Alert.alert("Could not load settings", error.message);
      } else if (data) {
        const nextProfile = data as Profile;
        setProfile(nextProfile);
        setName(nextProfile.name ?? "");
        setDailyGoal(String(nextProfile.daily_goal_kcal));
        setColor(nextProfile.color ?? colors[0]);
      }

      setLoading(false);
    };

    loadProfile();
  }, []);

  const save = async () => {
    if (!profile) return;

    const fullName = name.trim().replace(/\s+/g, " ");
    if (fullName.split(" ").length < 2) {
      Alert.alert("Invalid name", "Enter your first and last name.");
      return;
    }

    const parsedGoal = Number.parseInt(dailyGoal, 10);
    if (!Number.isFinite(parsedGoal) || parsedGoal <= 0) {
      Alert.alert("Invalid goal", "Daily goal must be a positive number.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: fullName,
        daily_goal_kcal: parsedGoal,
        color,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    setSaving(false);
    if (error) Alert.alert("Could not save settings", error.message);
    else router.back();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 px-5"
      >
        <View className="flex-row items-center justify-between py-3">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-field"
          >
            <Ionicons name="chevron-back" size={22} color="#24211d" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-ink">Settings</Text>
          <TouchableOpacity activeOpacity={0.8} onPress={signOut}>
            <Text className="text-sm font-semibold text-tomato">Sign out</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#2f7f86" />
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="pb-8 pt-5"
            keyboardShouldPersistTaps="handled"
          >
            <View className="items-center">
              <AvatarDot color={color} label={name || "Me"} size={72} />
            </View>

            <Text className="mb-2 mt-8 text-sm font-semibold text-ink">Full name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="First and last name"
              placeholderTextColor="#9a9287"
              className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
            />

            <Text className="mb-2 mt-5 text-sm font-semibold text-ink">Daily goal</Text>
            <TextInput
              value={dailyGoal}
              onChangeText={setDailyGoal}
              keyboardType="number-pad"
              placeholder="2000"
              placeholderTextColor="#9a9287"
              className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
            />

            <Text className="mb-3 mt-5 text-sm font-semibold text-ink">Avatar color</Text>
            <View className="flex-row gap-3">
              {colors.map((swatch) => (
                <TouchableOpacity
                  key={swatch}
                  activeOpacity={0.85}
                  onPress={() => setColor(swatch)}
                  className="h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: swatch }}
                >
                  {color === swatch ? <Ionicons name="checkmark" size={22} color="#fffdf8" /> : null}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={saving}
              onPress={save}
              className="mt-8 h-14 items-center justify-center rounded-lg bg-teal"
            >
              {saving ? (
                <ActivityIndicator color="#fffdf8" />
              ) : (
                <Text className="text-base font-semibold text-white">Save settings</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
