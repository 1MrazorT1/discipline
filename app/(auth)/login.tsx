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
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);
    if (signInError) setError(signInError.message);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 justify-center bg-paper px-6"
    >
      <Text className="text-4xl font-bold text-ink">Discipline</Text>
      <Text className="mt-2 text-base text-muted">Track meals with photo analysis.</Text>

      <View className="mt-8 gap-3">
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

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={loading}
        onPress={login}
        className="mt-6 h-14 items-center justify-center rounded-lg bg-teal"
      >
        {loading ? (
          <ActivityIndicator color="#fffdf8" />
        ) : (
          <Text className="text-base font-semibold text-white">Log in</Text>
        )}
      </TouchableOpacity>

      <Link href="/(auth)/register" asChild>
        <TouchableOpacity className="mt-5 items-center">
          <Text className="text-sm font-semibold text-teal">Create an account</Text>
        </TouchableOpacity>
      </Link>
    </KeyboardAvoidingView>
  );
}
