import { Ionicons } from "@expo/vector-icons";
import {
  useListCommunities,
  useJoinCommunity,
  useCreateCommunity,
  type Community,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PRIMARY = "#E8754A";
const BORDER = "rgba(232,117,74,0.18)";
const CARD_BG = "rgba(15,25,60,0.42)";

const CATEGORIES = ["technology", "business", "design", "science", "arts", "health"];

function CommunityCard({
  community,
  onJoin,
  joining,
}: {
  community: Community;
  onJoin: (id: number) => void;
  joining: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{community.name[0]?.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{community.name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="people" size={11} color="rgba(255,255,255,0.4)" />
            <Text style={styles.metaText}>{community.membersCount ?? 0} members</Text>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>{community.category}</Text>
            </View>
          </View>
        </View>
      </View>
      {community.description ? (
        <Text style={styles.description} numberOfLines={2}>{community.description}</Text>
      ) : null}
      <TouchableOpacity
        style={[
          styles.joinBtn,
          community.isMember && styles.joinedBtn,
        ]}
        disabled={community.isMember || joining}
        onPress={() => onJoin(community.id)}
        activeOpacity={0.8}
      >
        {community.isMember ? (
          <>
            <Ionicons name="checkmark-circle" size={13} color="rgba(255,255,255,0.4)" />
            <Text style={styles.joinedText}>Joined</Text>
          </>
        ) : (
          <Text style={styles.joinText}>{joining ? "JOINING..." : "JOIN COMMUNITY"}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function CommunitiesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("technology");

  const { data, isLoading, refetch, isRefetching } = useListCommunities();
  const joinMutation = useJoinCommunity();
  const createMutation = useCreateCommunity();

  const communities = data?.communities ?? [];

  const handleJoin = async (communityId: number) => {
    try {
      await joinMutation.mutateAsync({ communityId });
      refetch();
    } catch {
      // Silently fail; user will see no state change
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createMutation.mutateAsync({
        data: { name: name.trim(), description: description.trim(), category },
      });
      setName("");
      setDescription("");
      setCategory("technology");
      setCreateOpen(false);
      refetch();
    } catch {
      // Silently fail
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
          <Text style={styles.superLabel}>NETWORKS · ROOMS</Text>
          <Text style={styles.headerTitle}>COMMUNITIES</Text>
        </View>
        <TouchableOpacity onPress={() => setCreateOpen(true)} hitSlop={12} style={styles.plusBtn}>
          <Ionicons name="add" size={18} color={PRIMARY} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={communities}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item }) => (
            <CommunityCard
              community={item as Community}
              onJoin={handleJoin}
              joining={joinMutation.isPending}
            />
          )}
          contentContainerStyle={{
            padding: 16,
            gap: 10,
            paddingBottom: Math.max(insets.bottom + 20, 40),
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PRIMARY} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.18)" />
              <Text style={styles.emptyText}>No communities yet — create the first one</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={createOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>CREATE A COMMUNITY</Text>
              <TouchableOpacity onPress={() => setCreateOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Community Name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.input}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What's the mission of this community?"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              multiline
            />
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[
                    styles.categoryChip,
                    category === cat && styles.categoryChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      category === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[
                styles.createBtn,
                (!name.trim() || createMutation.isPending) && styles.createBtnDisabled,
              ]}
              onPress={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
            >
              <Text style={styles.createBtnText}>
                {createMutation.isPending ? "CREATING..." : "CREATE COMMUNITY"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  superLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(232,117,74,0.55)", letterSpacing: 2 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
  plusBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.35)",
    backgroundColor: "rgba(232,117,74,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: PRIMARY, fontSize: 16, fontFamily: "Inter_700Bold" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.92)" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  metaText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.4)" },
  categoryPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.25)",
    borderRadius: 3,
    marginLeft: 4,
  },
  categoryText: { fontSize: 8, fontFamily: "Inter_700Bold", color: PRIMARY, letterSpacing: 0.5, textTransform: "uppercase" },
  description: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", lineHeight: 17 },
  joinBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 9,
    borderRadius: 4,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  joinedBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  joinText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 1 },
  joinedText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 1 },
  empty: { paddingTop: 80, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)", textAlign: "center" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#0B1828",
    borderTopWidth: 1,
    borderColor: BORDER,
    padding: 20,
    paddingBottom: 36,
    gap: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 12, fontFamily: "Inter_700Bold", color: PRIMARY, letterSpacing: 1.5 },
  input: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.18)",
    color: "#fff",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
  },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 4,
  },
  categoryChipActive: { borderColor: PRIMARY, backgroundColor: "rgba(232,117,74,0.12)" },
  categoryChipText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 },
  categoryChipTextActive: { color: PRIMARY, fontFamily: "Inter_700Bold" },
  createBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 4,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 1 },
});
