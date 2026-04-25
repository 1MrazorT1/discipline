import { Text, View } from "react-native";

type AvatarDotProps = {
  color?: string | null;
  label?: string;
  size?: number;
};

export function AvatarDot({ color = "#3f9c75", label = "", size = 40 }: AvatarDotProps) {
  return (
    <View
      className="items-center justify-center rounded-full border-2 border-field"
      style={{ width: size, height: size, backgroundColor: color ?? "#3f9c75" }}
    >
      <Text className="text-sm font-bold text-white">{label.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}
