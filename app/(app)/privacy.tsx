import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

export default function PrivacyPolicyScreen() {
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
        <Text className="text-base font-bold text-ink">Privacy Policy</Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-12 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-4 text-sm text-muted">Effective date: August 19, 2026</Text>

        <SectionTitle title="1. Overview" />
        <SectionBody>
          Discipline ("the app", "we", "us", or "our") is a calorie-tracking
          mobile application. This Privacy Policy describes how we collect, use,
          and protect your information when you use our app. We are committed to
          protecting your privacy. By using Discipline, you agree to the
          collection and use of information in accordance with this policy.
        </SectionBody>

        <SectionTitle title="2. Data We Collect" />
        <SectionBody>
          • Account information: your name, email address, and avatar (if you
          choose to provide one) are stored in your Supabase profile.
          {"\n"}• Meal data: photos you upload, meal names, ingredient
          estimates, calorie counts, and notes are stored so we can show your
          food log history.
          {"\n"}• Ingredient data: custom ingredients you create, including
          nutrition facts and optional photos.
          {"\n"}• Analytics: we send photo data to the NVIDIA NIM API to
          generate calorie estimates. No personally identifiable information is
          sent with these requests — only the photo bytes and the prompt text.
        </SectionBody>

        <SectionTitle title="3. How We Use Your Data" />
        <SectionBody>
          • To analyze your meal photos and provide calorie estimates.
          {"\n"}• To store and display your meal history, ingredients, and
          nutrition logs.
          {"\n"}• To personalize your experience (avatar, daily goal, theme
          color).
          {"\n"}• To enable real-time updates so you can see analysis results
          as they complete.
        </SectionBody>

        <SectionTitle title="4. Third Parties" />
        <SectionBody>
          • Supabase: provides authentication, database, and storage. Your
          data is stored in Supabase project xpwgqneyzxyaafumuqdz.
          {"\n"}• NVIDIA: receives your meal photos (via signed URLs) to run
          the vision-language model for nutrition analysis. NVIDIA does not
          store or retain your images.
          {"\n"}• Expo: provides the build toolchain and OTA updates. No
          personal data is shared beyond standard crash/error reporting.
        </SectionBody>

        <SectionTitle title="5. Data Storage and Security" />
        <SectionBody>
          • All data is stored in the EU (Supabase EU region).
          {"\n"}• Photos are stored in a private storage bucket — they are
          never publicly accessible. Access is gated by authenticated signed
          URLs that expire.
          {"\n"}• Row-level security (RLS) is enforced on all tables so users
          can only access their own data.
          {"\n"}• We do not sell, rent, or share your data with advertisers.
        </SectionBody>

        <SectionTitle title="6. Your Rights" />
        <SectionBody>
          • You can view, export, and delete your data at any time from the
          app's settings or feed.
          {"\n"}• You can delete your account by contacting us or revoking
          your authentication.
          {"\n"}• You can request a copy of your data by reaching out to the
          project maintainer on GitHub.
        </SectionBody>

        <SectionTitle title="7. Children" />
        <SectionBody>
          The app is not intended for children under 13. We do not knowingly
          collect personal information from children under 13.
        </SectionBody>

        <SectionTitle title="8. Changes to This Policy" />
        <SectionBody>
          We may update this Privacy Policy from time to time. The effective
          date at the top will reflect the latest version. Significant changes
          will be communicated through app updates.
        </SectionBody>

        <SectionTitle title="9. Contact" />
        <SectionBody>
          If you have questions about this Privacy Policy, please open an issue
          at github.com/1mrazorT1/discipline.
        </SectionBody>
      </ScrollView>
    </SafeAreaView>
  );
}

const SectionTitle = ({ title }: { title: string }) => (
  <Text className="mb-2 mt-6 text-lg font-bold text-ink">{title}</Text>
);

const SectionBody = ({ children }: { children: ReactNode }) => (
  <Text className="text-sm leading-6 text-muted">{children}</Text>
);
