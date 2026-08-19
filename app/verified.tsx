import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";

export default function VerifiedScreen() {
  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 items-center justify-center px-6">
        <View className="items-center">
          <Text className="text-6xl">✓</Text>
          <Text className="mt-4 text-3xl font-bold text-ink">
            You are now verified
          </Text>
          <Text className="mt-2 text-center text-base text-muted">
            Your email has been confirmed. You can now log in and start
            tracking your meals.
          </Text>
        </View>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity className="mt-8 h-14 w-full items-center justify-center rounded-lg bg-teal">
            <Text className="text-base font-semibold text-white">
              Log in
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </SafeAreaView>
  );
}
