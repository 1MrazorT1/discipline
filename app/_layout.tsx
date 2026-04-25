import "react-native-gesture-handler";
import "@/global.css";
import * as Linking from "expo-linking";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { assertClientEnv } from "@/lib/env";
import { supabase } from "@/lib/supabase";

const getAuthParam = (url: string, key: string) => {
  try {
    const parsedUrl = new URL(url);
    const queryValue = parsedUrl.searchParams.get(key);
    if (queryValue) return queryValue;

    const hash = parsedUrl.hash.startsWith("#") ? parsedUrl.hash.slice(1) : parsedUrl.hash;
    return new URLSearchParams(hash).get(key);
  } catch {
    return null;
  }
};

export default function RootLayout() {
  const segments = useSegments();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    assertClientEnv();

    const handleAuthUrl = async (url: string | null) => {
      if (!url) return;

      const code = getAuthParam(url, "code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        return;
      }

      const accessToken = getAuthParam(url, "access_token");
      const refreshToken = getAuthParam(url, "refresh_token");
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    Linking.getInitialURL().then(handleAuthUrl);
    const linkListener = Linking.addEventListener("url", ({ url }) => {
      handleAuthUrl(url);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });

    return () => {
      listener.subscription.unsubscribe();
      linkListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    }

    if (session && inAuthGroup) {
      router.replace("/");
    }
  }, [ready, segments, session]);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color="#2f7f86" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
