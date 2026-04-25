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
import { createHouseholdInvite, joinHousehold } from "@/lib/households";
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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [householdWorking, setHouseholdWorking] = useState(false);

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

    const parsedGoal = Number.parseInt(dailyGoal, 10);
    if (!Number.isFinite(parsedGoal) || parsedGoal <= 0) {
      Alert.alert("Invalid goal", "Daily goal must be a positive number.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: name.trim(),
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

  const generateInvite = async () => {
    setHouseholdWorking(true);
    try {
      const invite = await createHouseholdInvite();
      setInviteCode(invite.code);
    } catch (inviteError) {
      Alert.alert(
        "Could not create invite",
        inviteError instanceof Error ? inviteError.message : "Try again.",
      );
    } finally {
      setHouseholdWorking(false);
    }
  };

  const submitJoinCode = async () => {
    const code = joinCode.trim();
    if (!code) {
      Alert.alert("Missing code", "Enter a household invite code.");
      return;
    }

    setHouseholdWorking(true);
    try {
      await joinHousehold(code);
      setJoinCode("");
      Alert.alert("Household joined", "Your household has been updated.");
      router.back();
    } catch (joinError) {
      Alert.alert(
        "Could not join household",
        joinError instanceof Error ? joinError.message : "Try again.",
      );
    } finally {
      setHouseholdWorking(false);
    }
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

            <Text className="mb-2 mt-8 text-sm font-semibold text-ink">Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
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

            <View className="mt-8 rounded-lg border border-line bg-field p-4">
              <Text className="text-base font-bold text-ink">Household</Text>
              <Text className="mt-1 text-sm text-muted">
                Share a code to invite someone, or enter a code to join another household.
              </Text>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={householdWorking}
                onPress={generateInvite}
                className="mt-4 h-12 flex-row items-center justify-center gap-2 rounded-lg bg-teal"
              >
                {householdWorking ? (
                  <ActivityIndicator color="#fffdf8" />
                ) : (
                  <Ionicons name="ticket" size={18} color="#fffdf8" />
                )}
                <Text className="font-semibold text-white">Generate invite code</Text>
              </TouchableOpacity>

              {inviteCode ? (
                <View className="mt-4 rounded-lg border border-line bg-paper p-4">
                  <Text className="text-xs font-semibold uppercase text-muted">Invite code</Text>
                  <Text className="mt-1 text-3xl font-bold tracking-widest text-ink">
                    {inviteCode}
                  </Text>
                </View>
              ) : null}

              <Text className="mb-2 mt-5 text-sm font-semibold text-ink">Join with code</Text>
              <View className="flex-row gap-2">
                <TextInput
                  value={joinCode}
                  onChangeText={(value) => setJoinCode(value.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="ABC123"
                  placeholderTextColor="#9a9287"
                  className="h-12 flex-1 rounded-lg border border-line bg-paper px-4 text-base font-semibold text-ink"
                />
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={householdWorking}
                  onPress={submitJoinCode}
                  className="h-12 w-24 items-center justify-center rounded-lg bg-ink"
                >
                  <Text className="font-semibold text-white">Join</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={saving}
              onPress={save}
              className="mt-8 h-14 items-center justify-center rounded-lg bg-ink"
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
