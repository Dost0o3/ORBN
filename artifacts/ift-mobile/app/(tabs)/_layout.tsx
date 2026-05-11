import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListNotifications } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const GLASS_BORDER = "rgba(100,180,220,0.18)";

export default function TabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === "web";
  const safeAreaInsets = useSafeAreaInsets();

  const { data: notifData } = useListNotifications({}, {
    query: { refetchInterval: 30_000, queryKey: ["listNotifications"] },
  });
  const unreadCount = notifData?.unreadCount ?? 0;

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: "transparent" },
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "rgba(160,200,230,0.50)",
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 10,
          marginTop: -2,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: GLASS_BORDER,
          elevation: 0,
          paddingBottom: isWeb ? 6 : safeAreaInsets.bottom,
          paddingTop: 8,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () => (
          <BlurView
            intensity={isWeb ? 0 : Platform.OS === "ios" ? 80 : 90}
            tint="dark"
            style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === "ios" ? "transparent" : "rgba(8,15,45,0.82)" }]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="home" size={22} color={focused ? colors.primary : color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="search" size={22} color={focused ? colors.primary : color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: ({ focused }) => (
            <View
              style={[
                styles.createBtn,
                {
                  backgroundColor: focused ? colors.primary : "rgba(100,180,220,0.15)",
                  borderColor: focused ? colors.primary : "rgba(232,117,74,0.25)",
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: focused ? 0.7 : 0,
                  shadowRadius: 10,
                },
              ]}
            >
              <Ionicons
                name="add"
                size={26}
                color={focused ? colors.primaryForeground : colors.primary}
              />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Inbox",
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.destructive,
            fontSize: 10,
            fontWeight: "800",
            minWidth: 16,
            height: 16,
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "notifications" : "notifications-outline"}
              size={22}
              color={focused ? colors.primary : color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={22}
              color={focused ? colors.primary : color}
            />
          ),
        }}
      />
      <Tabs.Screen name="connect" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  createBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -8,
    elevation: 4,
  },
});
