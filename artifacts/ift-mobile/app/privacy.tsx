import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useGetMe, useSetGhostMode } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "../lib/api-base";

const GLASS_BORDER = "rgba(100,180,220,0.18)";

const KEY_DM_RECEIPTS = "@orbn:dm_read_receipts";
const KEY_PUSH_LIKES = "@orbn:push_likes";
const KEY_PUSH_COMMENTS = "@orbn:push_comments";
const KEY_PUSH_FOLLOWS = "@orbn:push_follows";
const KEY_PUSH_DMS = "@orbn:push_dms";

function Section({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function ToggleRow({
  icon,
  label,
  sublabel,
  value,
  onChange,
  disabled,
  loading,
  primaryColor,
  testID,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  primaryColor: string;
  testID?: string;
}) {
  return (
    <View style={styles.row} testID={testID ? `${testID}-row` : undefined}>
      <View style={[styles.rowIcon, { backgroundColor: `${primaryColor}14`, borderColor: `${primaryColor}30` }]}>
        <Ionicons name={icon as any} size={16} color={`${primaryColor}cc`} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel && <Text style={styles.rowSublabel}>{sublabel}</Text>}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={primaryColor} />
      ) : (
        <Switch
          testID={testID}
          accessibilityLabel={label}
          accessibilityState={{ checked: value }}
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: "rgba(255,255,255,0.1)", true: primaryColor }}
          thumbColor="#fff"
        />
      )}
    </View>
  );
}

export default function PrivacyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const setGhost = useSetGhostMode();

  const [ghostOn, setGhostOn] = useState<boolean>(me?.ghostMode === true);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [pushLikes, setPushLikes] = useState(true);
  const [pushComments, setPushComments] = useState(true);
  const [pushFollows, setPushFollows] = useState(true);
  const [pushDMs, setPushDMs] = useState(true);

  useEffect(() => {
    setGhostOn(me?.ghostMode === true);
  }, [me?.ghostMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, l, c, f, d] = await Promise.all([
        AsyncStorage.getItem(KEY_DM_RECEIPTS),
        AsyncStorage.getItem(KEY_PUSH_LIKES),
        AsyncStorage.getItem(KEY_PUSH_COMMENTS),
        AsyncStorage.getItem(KEY_PUSH_FOLLOWS),
        AsyncStorage.getItem(KEY_PUSH_DMS),
      ]);
      if (cancelled) return;
      if (r !== null) setReadReceipts(r === "1");
      if (l !== null) setPushLikes(l === "1");
      if (c !== null) setPushComments(c === "1");
      if (f !== null) setPushFollows(f === "1");
      if (d !== null) setPushDMs(d === "1");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (key: string, value: boolean) => {
    await AsyncStorage.setItem(key, value ? "1" : "0");
  }, []);

  const toggleGhost = async (next: boolean) => {
    Haptics.selectionAsync();
    const previous = ghostOn;
    setGhostOn(next);
    setGhostLoading(true);
    try {
      await setGhost.mutateAsync({ data: { enabled: next } });
      qc.invalidateQueries({ queryKey: ["getMe"] });
    } catch {
      setGhostOn(previous);
      Alert.alert("Couldn't update Ghost Mode", "Try again in a moment.");
    } finally {
      setGhostLoading(false);
    }
  };

  const updatePushPref = async (kind: "likes" | "comments" | "follows" | "dms", value: boolean) => {
    Haptics.selectionAsync();
    try {
      const token = await getToken();
      await fetch(`${API_BASE}/api/notifications/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ [kind]: value }),
      });
    } catch {
      // Silent — local state already updated, stored to AsyncStorage as backup
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 20 : insets.top + 12 },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.superLabel}>ORBN</Text>
          <Text style={styles.headerTitle}>Privacy & Notifications</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 32, 40),
          paddingTop: 18,
        }}
      >
        <Section title="Privacy" />
        <View style={styles.card}>
          <ToggleRow
            icon="eye-off-outline"
            label="Ghost Mode"
            sublabel="New posts attributed to Anonymous"
            value={ghostOn}
            onChange={toggleGhost}
            loading={ghostLoading}
            primaryColor={colors.primary}
          />
          <View style={styles.divider} />
          <ToggleRow
            testID="privacy-toggle-dm-read-receipts"
            icon="checkmark-done-outline"
            label="Read receipts in DMs"
            sublabel="Show others when you've read their messages"
            value={readReceipts}
            onChange={(v) => {
              setReadReceipts(v);
              persist(KEY_DM_RECEIPTS, v);
              updatePushPref("dms", v);
            }}
            primaryColor={colors.primary}
          />
        </View>

        <Section title="Push Notifications" />
        <View style={styles.card}>
          <ToggleRow
            icon="heart-outline"
            label="Likes"
            value={pushLikes}
            onChange={(v) => {
              setPushLikes(v);
              persist(KEY_PUSH_LIKES, v);
              updatePushPref("likes", v);
            }}
            primaryColor={colors.primary}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="chatbubble-outline"
            label="Comments"
            value={pushComments}
            onChange={(v) => {
              setPushComments(v);
              persist(KEY_PUSH_COMMENTS, v);
              updatePushPref("comments", v);
            }}
            primaryColor={colors.primary}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="person-add-outline"
            label="Follows"
            value={pushFollows}
            onChange={(v) => {
              setPushFollows(v);
              persist(KEY_PUSH_FOLLOWS, v);
              updatePushPref("follows", v);
            }}
            primaryColor={colors.primary}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="paper-plane-outline"
            label="Direct messages"
            value={pushDMs}
            onChange={(v) => {
              setPushDMs(v);
              persist(KEY_PUSH_DMS, v);
              updatePushPref("dms", v);
            }}
            primaryColor={colors.primary}
          />
        </View>

        <Section title="Blocked Accounts" />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/blocked" as any)}
          >
            <View style={[styles.rowIcon, { backgroundColor: "rgba(220,20,60,0.14)", borderColor: "rgba(220,20,60,0.30)" }]}>
              <Ionicons name="ban-outline" size={16} color="rgba(220,20,60,0.85)" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Manage blocked users</Text>
              <Text style={styles.rowSublabel}>People you've blocked</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(232,117,74,0.15)",
  },
  superLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.3 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginLeft: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.85)" },
  rowSublabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: GLASS_BORDER, marginLeft: 60 },
});
