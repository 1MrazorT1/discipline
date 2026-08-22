import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { KeyboardAwareFlatList } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { AvatarDot } from "@/components/AvatarDot";
import { supabase } from "@/lib/supabase";
import { uploadMealPhoto } from "@/lib/upload";
import type { Profile } from "@/types/database";

const colors = ["#3f9c75", "#d95b43", "#2f7f86", "#d6a23a", "#6d6bb3"];

export default function SettingsScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [dailyGoal, setDailyGoal] = useState("2000");
  const [color, setColor] = useState(colors[0]);
  const [effectiveDate, setEffectiveDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarObjectKey, setAvatarObjectKey] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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
        if (nextProfile.effective_date) {
          const d = new Date(nextProfile.effective_date);
          if (!Number.isNaN(d.getTime())) setEffectiveDate(d);
        } else {
          setEffectiveDate(new Date());
        }
        if (nextProfile.avatar_url) {
          // Load avatar preview — avatar_url stores private storage keys
          try {
            const { data: signed } = await supabase.storage
              .from("meal-photos")
              .createSignedUrl(nextProfile.avatar_url, 86400);
            if (signed?.signedUrl) setAvatarUri(signed.signedUrl);
          } catch {
            // Silently ignore — fall back to AvatarDot
          }
        }
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
        avatar_url: avatarObjectKey ?? profile.avatar_url,
        effective_date: effectiveDate?.toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    setSaving(false);
    if (error) Alert.alert("Could not save settings", error.message);
    else router.back();
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Enable photo access to set an avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) return;

    setAvatarUri(uri);
    setUploadingAvatar(true);
    try {
      const objectKey = await uploadMealPhoto(uri);
      setAvatarObjectKey(objectKey);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Try again.");
      setAvatarUri(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
        <KeyboardAwareFlatList
          data={[
            {
              key: "avatar",
              render: () => (
                <View className="items-center">
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} className="h-20 w-20 rounded-full" />
                  ) : (
                    <AvatarDot color={color} label={name || "Me"} size={72} />
                  )}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={uploadingAvatar}
                    onPress={pickAvatar}
                    className="mt-3 rounded-lg bg-field px-4 py-2"
                  >
                    {uploadingAvatar ? (
                      <ActivityIndicator color="#2f7f86" />
                    ) : (
                      <Text className="text-sm font-semibold text-ink">
                        {avatarUri ? "Change avatar" : "Set avatar"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ),
            },
            {
              key: "name-input",
              render: () => (
                <>
                  <Text className="mb-2 mt-8 text-sm font-semibold text-ink">Full name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="First and last name"
                    placeholderTextColor="#9a9287"
                    className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
                  />
                </>
              ),
            },
            {
              key: "goal-input",
              render: () => (
                <>
                  <Text className="mb-2 mt-5 text-sm font-semibold text-ink">Daily goal</Text>
                  <TextInput
                    value={dailyGoal}
                    onChangeText={setDailyGoal}
                    keyboardType="number-pad"
                    placeholder="2000"
                    placeholderTextColor="#9a9287"
                    className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
                  />
                </>
              ),
            },
            {
              key: "effective-date",
              render: () => (
                <>
                  <Text className="mb-2 mt-5 text-sm font-semibold text-ink">Budget effective date</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setShowDatePicker(true)}
                    className="rounded-lg border border-line bg-field px-4 py-4"
                  >
                    <Text className="text-base text-ink">
                      {effectiveDate ? effectiveDate.toLocaleDateString() : "Pick a date"}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={effectiveDate ?? new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_, selectedDate) => {
                        setShowDatePicker(false);
                        if (selectedDate) setEffectiveDate(selectedDate);
                      }}
                    />
                  )}
                </>
              ),
            },
            {
              key: "color-picker",
              render: () => (
                <>
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
                </>
              ),
            },
            {
              key: "save-button",
              render: () => (
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
              ),
            },
            {
              key: "privacy-link",
              render: () => (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push("/(app)/privacy")}
                  className="mt-6 flex-row items-center justify-center gap-2"
                >
                  <Ionicons name="shield-outline" size={18} color="#2f7f86" />
                  <Text className="text-sm font-semibold text-ink">Privacy Policy</Text>
                </TouchableOpacity>
              ),
            },
            {
              key: "version",
              render: () => (
                <Text className="mt-8 text-center text-xs text-muted">
                  Discipline v{require("../../package.json").version}
                </Text>
              ),
            },
          ]}
          renderItem={({ item }) => item.render()}
          keyExtractor={(item) => item.key}
          contentContainerClassName="px-5 pb-8 pt-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
