import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type HouseholdRingMember = {
  name: string;
  color: string;
  consumed_kcal: number;
  goal_kcal: number;
};

type HouseholdRingsProps = {
  members: [HouseholdRingMember, HouseholdRingMember];
  size?: number;
};

const overGoalColor = "#d95b43";
const trackColor = "#e5ded2";

const Ring = ({
  size,
  strokeWidth,
  progress,
  color,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(progress, 1));

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - clampedProgress)}
        rotation="-90"
        originX={size / 2}
        originY={size / 2}
      />
    </Svg>
  );
};

export function HouseholdRings({ members, size = 220 }: HouseholdRingsProps) {
  const [outerMember, innerMember] = members;
  const strokeWidth = 14;
  const innerSize = Math.round(size * 0.74);
  const totalKcal = members.reduce((sum, member) => sum + member.consumed_kcal, 0);

  const outerGoal = Math.max(outerMember.goal_kcal, 1);
  const innerGoal = Math.max(innerMember.goal_kcal, 1);

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <View className="absolute">
        <Ring
          size={size}
          strokeWidth={strokeWidth}
          progress={outerMember.consumed_kcal / outerGoal}
          color={outerMember.consumed_kcal > outerMember.goal_kcal ? overGoalColor : outerMember.color}
        />
      </View>
      <View className="absolute">
        <Ring
          size={innerSize}
          strokeWidth={strokeWidth}
          progress={innerMember.consumed_kcal / innerGoal}
          color={innerMember.consumed_kcal > innerMember.goal_kcal ? overGoalColor : innerMember.color}
        />
      </View>
      <Text className="text-4xl font-bold text-ink">{Math.round(totalKcal)}</Text>
      <Text className="mt-1 text-sm font-semibold text-muted">kcal today</Text>
    </View>
  );
}
