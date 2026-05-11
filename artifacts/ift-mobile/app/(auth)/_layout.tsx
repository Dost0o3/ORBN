import { Stack } from "expo-router";
import React from "react";

const TRANSPARENT = { backgroundColor: "transparent" } as const;

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: TRANSPARENT,
      }}
    >
      <Stack.Screen name="sign-in" options={{ contentStyle: TRANSPARENT }} />
      <Stack.Screen name="sign-up" options={{ contentStyle: TRANSPARENT }} />
    </Stack>
  );
}
