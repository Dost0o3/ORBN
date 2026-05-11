import {
  useFollowUser,
  useUnfollowUser,
  type UserProfile,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

function Avatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  const colors = useColors();
  const initials = name
    .split(" ")
    .map((n) => n[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: 48, height: 48, borderRadius: 24 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: "rgba(201,168,76,0.3)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#C9A84C", fontSize: 17, fontFamily: "Inter_700Bold" }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

interface Props {
  user: UserProfile;
}

export default function UserCard({ user }: Props) {
  const colors = useColors();
  const router = useRouter();
  const [following, setFollowing] = useState(user.isFollowing ?? false);

  const followUser = useFollowUser();
  const unfollowUser = useUnfollowUser();

  const goToProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${user.id}` as any);
  };

  const toggleFollow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (following) {
      setFollowing(false);
      unfollowUser.mutateAsync({ userId: user.id });
    } else {
      setFollowing(true);
      followUser.mutateAsync({ userId: user.id });
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, { borderBottomColor: colors.border }]}
      onPress={goToProfile}
      activeOpacity={0.75}
    >
      <Avatar name={user.displayName ?? "IFT Member"} avatarUrl={user.avatarUrl} />
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]}>{user.displayName}</Text>
        {user.username ? (
          <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{user.username}</Text>
        ) : null}
        {user.occupation ? (
          <Text style={[styles.headline, { color: colors.mutedForeground }]} numberOfLines={1}>
            {user.occupation}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          toggleFollow();
        }}
        style={[
          styles.followBtn,
          {
            backgroundColor: following ? "transparent" : "#C9A84C",
            borderColor: following ? colors.border : "#C9A84C",
          },
        ]}
      >
        <Text
          style={[
            styles.followBtnText,
            { color: following ? colors.mutedForeground : "#000" },
          ]}
        >
          {following ? "Following" : "Follow"}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  info: { flex: 1 },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  headline: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1,
  },
  followBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
