import { Ionicons } from "@expo/vector-icons";
import {
  useListBounties,
  useCreateBounty,
  useGetBountySubmissions,
  useCreateBountySubmission,
  useSelectBountyWinner,
  useCloseBounty,
  useGetMe,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = ["All", "Design", "Code", "Strategy", "Research", "Marketing", "Legal", "Finance"];

const STATUS_COLORS: Record<string, { text: string; border: string; bg: string }> = {
  open: { text: "#E8754A", border: "rgba(232,117,74,0.40)", bg: "rgba(100,180,220,0.10)" },
  claimed: { text: "#DC143C", border: "rgba(220,20,60,0.4)", bg: "rgba(220,20,60,0.08)" },
  closed: { text: "rgba(255,255,255,0.3)", border: "rgba(255,255,255,0.15)", bg: "rgba(255,255,255,0.04)" },
};

function GoldInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  style?: any;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.2)"
      multiline={multiline}
      numberOfLines={multiline ? 4 : 1}
      style={[styles.input, multiline && styles.inputMulti, { color: "#fff" }, style]}
    />
  );
}

function BountyCard({
  item,
  onPress,
  isMine,
}: {
  item: any;
  onPress: () => void;
  isMine: boolean;
}) {
  const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS.open;
  return (
    <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <View style={[styles.statusBadge, { borderColor: sc.border, backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>{item.status?.toUpperCase()}</Text>
        </View>
        <Text style={styles.categoryBadge}>{item.category}</Text>
        {isMine && <Text style={styles.mineBadge}>MINE</Text>}
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      <View style={styles.cardFooter}>
        {item.reward ? (
          <View style={styles.rewardRow}>
            <Ionicons name="star" size={11} color="#E8754A" />
            <Text style={styles.reward}>{item.reward}</Text>
          </View>
        ) : null}
        {item.deadline ? (
          <View style={styles.deadlineRow}>
            <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.3)" />
            <Text style={styles.deadline}>{new Date(item.deadline).toLocaleDateString()}</Text>
          </View>
        ) : null}
        <View style={styles.subsRow}>
          <Ionicons name="people-outline" size={11} color="rgba(255,255,255,0.3)" />
          <Text style={styles.subsText}>{item.submissionsCount ?? 0} subs</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function BountiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();

  const [cat, setCat] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<any>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [newBounty, setNewBounty] = useState({
    title: "", description: "", category: "Design", reward: "", deadline: "",
  });
  const [newSub, setNewSub] = useState({ content: "", link: "" });

  const { data, refetch, isRefetching } = useListBounties({ category: cat !== "All" ? cat : undefined });
  const createBounty = useCreateBounty();
  const createSub = useCreateBountySubmission();
  const selectWinner = useSelectBountyWinner();
  const closeBounty = useCloseBounty();
  const { data: subsData, refetch: refetchSubs } = useGetBountySubmissions(selectedBounty?.id ?? 0);

  const bounties = (data?.bounties ?? []) as any[];
  const submissions = (subsData?.submissions ?? []) as any[];

  const handleCreate = async () => {
    if (!newBounty.title.trim()) return;
    try {
      await createBounty.mutateAsync({ data: { ...newBounty, deadline: newBounty.deadline || undefined } });
      refetch();
      setCreateOpen(false);
      setNewBounty({ title: "", description: "", category: "Design", reward: "", deadline: "" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not post bounty. Try again.");
    }
  };

  const handleSubmit = async () => {
    if (!selectedBounty || !newSub.content.trim()) return;
    try {
      await createSub.mutateAsync({
        bountyId: selectedBounty.id,
        data: { content: newSub.content, link: newSub.link || undefined },
      });
      setSubmitOpen(false);
      setNewSub({ content: "", link: "" });
      refetchSubs();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Submission failed. Try again.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 12,
            borderBottomColor: "rgba(100,180,220,0.18)",
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.superLabel}>CHALLENGES</Text>
          <Text style={styles.headerTitle}>Bounty Board</Text>
        </View>
        <TouchableOpacity onPress={() => setCreateOpen(true)} style={styles.createBtn}>
          <Ionicons name="add" size={16} color="#000" />
          <Text style={styles.createBtnText}>Post</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => setCat(c)}
            style={[styles.catChip, cat === c && styles.catChipActive]}
          >
            <Text style={[styles.catText, cat === c && styles.catTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={bounties}
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item }) => (
          <BountyCard
            item={item}
            isMine={item.poster?.id === me?.id}
            onPress={() => {
              setSelectedBounty(item);
              refetchSubs();
            }}
          />
        )}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: Math.max(insets.bottom + 20, 40) }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#E8754A" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="rocket-outline" size={40} color="rgba(255,255,255,0.1)" />
            <Text style={styles.emptyText}>No bounties yet. Post the first one.</Text>
          </View>
        }
      />

      {/* CREATE MODAL */}
      <Modal visible={createOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Post a Bounty</Text>
                <TouchableOpacity onPress={() => setCreateOpen(false)}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 500 }}>
                <View style={{ gap: 12, padding: 16 }}>
                  <GoldInput value={newBounty.title} onChangeText={(v) => setNewBounty(f => ({ ...f, title: v }))} placeholder="Title *" />
                  <GoldInput value={newBounty.description} onChangeText={(v) => setNewBounty(f => ({ ...f, description: v }))} placeholder="Describe the challenge..." multiline />
                  <GoldInput value={newBounty.reward} onChangeText={(v) => setNewBounty(f => ({ ...f, reward: v }))} placeholder="Reward (e.g. $500, equity)" />
                  <GoldInput value={newBounty.deadline} onChangeText={(v) => setNewBounty(f => ({ ...f, deadline: v }))} placeholder="Deadline (YYYY-MM-DD)" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }} contentContainerStyle={{ gap: 8 }}>
                    {CATEGORIES.slice(1).map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setNewBounty(f => ({ ...f, category: c }))}
                        style={[styles.catChip, newBounty.category === c && styles.catChipActive]}
                      >
                        <Text style={[styles.catText, newBounty.category === c && styles.catTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </ScrollView>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={createBounty.isPending}
                style={[styles.modalActionBtn, (!newBounty.title.trim() || createBounty.isPending) && { opacity: 0.5 }]}
              >
                {createBounty.isPending ? <ActivityIndicator color="#000" /> : <Text style={styles.modalActionText}>Post Bounty</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal visible={!!selectedBounty} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: "85%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedBounty?.title}</Text>
              <TouchableOpacity onPress={() => setSelectedBounty(null)}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Text style={styles.detailDesc}>{selectedBounty?.description}</Text>
              {selectedBounty?.reward && (
                <View style={styles.rewardRow}>
                  <Ionicons name="star" size={13} color="#E8754A" />
                  <Text style={styles.reward}>{selectedBounty.reward}</Text>
                </View>
              )}
              <Text style={styles.subsHeading}>{submissions.length} Submissions</Text>
              {submissions.map((s: any) => (
                <View key={s.id} style={styles.subCard}>
                  <Text style={styles.subAuthor}>{s.submitter?.displayName ?? "Operator"}</Text>
                  <Text style={styles.subContent}>{s.content}</Text>
                  {s.link ? <Text style={styles.subLink}>{s.link}</Text> : null}
                  {selectedBounty?.poster?.id === me?.id && selectedBounty?.status === "open" && (
                    <TouchableOpacity
                      onPress={async () => {
                        await selectWinner.mutateAsync({ bountyId: selectedBounty.id, submissionId: s.id });
                        refetch();
                        refetchSubs();
                        setSelectedBounty(null);
                      }}
                      style={styles.winnerBtn}
                    >
                      <Text style={styles.winnerBtnText}>Select as Winner</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
            {selectedBounty?.status === "open" && selectedBounty?.poster?.id !== me?.id && (
              <TouchableOpacity onPress={() => setSubmitOpen(true)} style={styles.modalActionBtn}>
                <Text style={styles.modalActionText}>Submit Solution</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* SUBMIT MODAL */}
      <Modal visible={submitOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Submit Solution</Text>
                <TouchableOpacity onPress={() => setSubmitOpen(false)}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 16, gap: 12 }}>
                <GoldInput value={newSub.content} onChangeText={(v) => setNewSub(f => ({ ...f, content: v }))} placeholder="Describe your solution..." multiline />
                <GoldInput value={newSub.link} onChangeText={(v) => setNewSub(f => ({ ...f, link: v }))} placeholder="Link (optional)" />
                <TouchableOpacity onPress={handleSubmit} disabled={!newSub.content.trim() || createSub.isPending} style={[styles.modalActionBtn, (!newSub.content.trim() || createSub.isPending) && { opacity: 0.5 }]}>
                  {createSub.isPending ? <ActivityIndicator color="#000" /> : <Text style={styles.modalActionText}>Submit</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  superLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(232,117,74,0.50)", letterSpacing: 2 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.3 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8754A",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  createBtnText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.5 },
  catBar: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(100,180,220,0.12)", paddingVertical: 10, flexGrow: 0 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  catChipActive: { backgroundColor: "#E8754A", borderColor: "#E8754A" },
  catText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.45)" },
  catTextActive: { color: "#000" },
  card: {
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.15)",
    padding: 14,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.015)",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  categoryBadge: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.35)" },
  mineBadge: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#E8754A", marginLeft: "auto" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.9)" },
  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", lineHeight: 17 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 12 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  reward: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#E8754A" },
  deadlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  deadline: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },
  subsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
  subsText: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.22)", textAlign: "center" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)", width: "100%" },
  modalBox: {
    backgroundColor: "rgba(20,18,14,0.97)",
    borderTopWidth: 1,
    borderColor: "rgba(100,180,220,0.22)",
    width: "100%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(100,180,220,0.15)",
  },
  modalTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", flex: 1, marginRight: 12 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.20)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  inputMulti: { minHeight: 80, textAlignVertical: "top", paddingTop: 10 },
  modalActionBtn: {
    backgroundColor: "#E8754A",
    margin: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalActionText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.8, textTransform: "uppercase" },
  detailDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", lineHeight: 19 },
  subsHeading: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(201,168,76,0.6)", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 8 },
  subCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  subAuthor: { fontSize: 12, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.7)" },
  subContent: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", lineHeight: 17 },
  subLink: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#E8754A" },
  winnerBtn: {
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.35)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  winnerBtnText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#E8754A", letterSpacing: 0.8 },
});
