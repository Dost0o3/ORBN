import React from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

interface Props {
  tier: string | null | undefined;
  size?: number;
}

export default function VerificationBadge({ tier, size = 14 }: Props) {
  if (tier !== "silver" && tier !== "blue") return null;
  const fill = tier === "blue" ? "#1D9BF0" : "#9CA3AF";
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 1.5l2.25 1.95 2.97-.32 1.55 2.55 2.83.94-.32 2.97L23 12l-1.72 2.4.32 2.98-2.83.93-1.55 2.56-2.97-.33L12 22.5l-2.25-1.96-2.97.33-1.55-2.56-2.83-.93.32-2.98L1 12l1.72-2.41-.32-2.97 2.83-.94L6.78 3.13l2.97.32L12 1.5z"
          fill={fill}
        />
        <Path
          d="M9.5 12.5l1.9 1.9 3.6-4.4"
          stroke="white"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
