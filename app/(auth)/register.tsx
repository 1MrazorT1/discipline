import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ensureProfile } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const register = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    const user = data.user;
    if (signUpError || !user) {
      setLoading(false);
      setError(signUpError?.message ?? "Could not create account.");
      return;
    }

    if (!data.session) {
      setLoading(false);
      setNotice("Check your email to confirm your account, then log in.");
      return;
    }

    try {
      await ensureProfile({
        userId: user.id,
        email: email.trim(),
        name,
      });
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Could not create profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 justify-center bg-paper px-6"
    >
      <Text className="text-4xl font-bold text-ink">Join Discipline</Text>
      <Text className="mt-2 text-base text-muted">Create your household calorie plan.</Text>

      <View className="mt-8 gap-3">
        <TextInput
          placeholder="Name"
          placeholderTextColor="#9a9287"
          value={name}
          onChangeText={setName}
          className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
        />
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#9a9287"
          value={email}
          onChangeText={setEmail}
          className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
        />
        <TextInput
          autoCapitalize="none"
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#9a9287"
          value={password}
          onChangeText={setPassword}
          className="rounded-lg border border-line bg-field px-4 py-4 text-base text-ink"
        />
      </View>

      {error ? <Text className="mt-4 text-sm text-tomato">{error}</Text> : null}
      {notice ? <Text className="mt-4 text-sm font-semibold text-teal">{notice}</Text> : null}

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={loading}
        onPress={register}
        className="mt-6 h-14 items-center justify-center rounded-lg bg-ink"
      >
        {loading ? (
          <ActivityIndicator color="#fffdf8" />
        ) : (
          <Text className="text-base font-semibold text-white">Create account</Text>
        )}
      </TouchableOpacity>

      <Link href="/(auth)/login" asChild>
        <TouchableOpacity className="mt-5 items-center">
          <Text className="text-sm font-semibold text-teal">I already have an account</Text>
        </TouchableOpacity>
      </Link>
    </KeyboardAvoidingView>
  );
}
