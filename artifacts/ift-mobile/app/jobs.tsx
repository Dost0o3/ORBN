import { Ionicons } from "@expo/vector-icons";
import { useListJobs, useGetAiJobMatches, useApplyToJob } from "@workspace/api-client-react";
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

const TYPE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  "full-time": { text: "#DC143C", bg: "rgba(220,20,60,0.08)", border: "rgba(220,20,60,0.25)" },
  "part-time": { text: "#E8754A", bg: "rgba(100,180,220,0.10)", border: "rgba(232,117,74,0.25)" },
  remote: { text: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)" },
  contract: { text: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)" },
};

function JobCard({ item, onPress }: { item: any; onPress: () => void }) {
  const tc = TYPE_COLORS[item.type] ?? TYPE_COLORS["full-time"];
  return (
    <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <View style={styles.companyAvatar}>
          <Text style={styles.companyInitial}>{(item.company ?? "C")[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardCompany} numberOfLines={1}>{item.company}</Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: tc.bg, borderColor: tc.border }]}>
          <Text style={[styles.typeText, { color: tc.text }]}>{item.type}</Text>
        </View>
      </View>
      {item.location && (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.3)" />
          <Text style={styles.locationText}>{item.location}</Text>
        </View>
      )}
      {item.skills?.length > 0 && (
        <View style={styles.skillsRow}>
          {item.skills.slice(0, 4).map((s: string) => (
            <View key={s} style={styles.skillChip}>
              <Text style={styles.skillText}>{s}</Text>
            </View>
          ))}
        </View>
      )}
      {item.aiMatchScore != null && (
        <View style={styles.matchRow}>
          <Ionicons name="star" size={11} color="#E8754A" />
          <Text style={styles.matchText}>{item.aiMatchScore}% AI Match</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function JobsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tab, setTab] = useState<"all" | "ai">("all");
  const [query, setQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [coverLetter, setCoverLetter] = useState("");

  const { data: jobsData, isLoading, refetch, isRefetching } = useListJobs({ q: query || undefined });
  const { data: aiData } = useGetAiJobMatches();
  const applyMutation = useApplyToJob();

  const jobs = tab === "ai" ? (aiData?.jobs ?? []) : (jobsData?.jobs ?? []);

  const handleApply = async () => {
    if (!selectedJob) return;
    try {
      await applyMutation.mutateAsync({ jobId: Number(selectedJob.id), data: { coverLetter } });
      setSelectedJob(null);
      setCoverLetter("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Applied!", `Your application to ${selectedJob.title} was sent.`);
    } catch {
      Alert.alert("Error", "Application failed. Please try again.");
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
          <Text style={styles.superLabel}>OPPORTUNITIES</Text>
          <Text style={styles.headerTitle}>The Board</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            onPress={() => setTab("all")}
            style={[styles.tabBtn, tab === "all" && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, tab === "all" && styles.tabTextActive]}>All Jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab("ai")}
            style={[styles.tabBtn, tab === "ai" && styles.tabBtnActive]}
          >
            <Ionicons name="star" size={11} color={tab === "ai" ? "#000" : "#E8754A"} />
            <Text style={[styles.tabText, tab === "ai" && styles.tabTextActive]}>AI Match</Text>
          </TouchableOpacity>
        </View>

        {tab === "all" && (
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.3)" />
            <TextInput
              style={[styles.searchInput, { color: "#fff" }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search jobs..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <FlatList
        data={jobs as any[]}
        keyExtractor={(j) => String(j.id)}
        renderItem={({ item }) => <JobCard item={item} onPress={() => setSelectedJob(item)} />}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: Math.max(insets.bottom + 20, 40) }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#E8754A" />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator color="#E8754A" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={40} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyText}>
                {tab === "ai" ? "No AI matches yet. Complete your profile first." : "No jobs found."}
              </Text>
            </View>
          )
        }
      />

      {/* JOB DETAIL MODAL */}
      <Modal visible={!!selectedJob} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={[styles.modalBox, { maxHeight: "88%" }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedJob?.title}</Text>
                <TouchableOpacity onPress={() => setSelectedJob(null)}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
                <View style={styles.jobMetaRow}>
                  <Text style={styles.jobCompany}>{selectedJob?.company}</Text>
                  <Text style={styles.jobLocation}>{selectedJob?.location}</Text>
                </View>
                <Text style={styles.jobDesc}>{selectedJob?.description}</Text>
                {selectedJob?.skills?.length > 0 && (
                  <View style={styles.skillsRow}>
                    {selectedJob.skills.map((s: string) => (
                      <View key={s} style={styles.skillChip}>
                        <Text style={styles.skillText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.coverLabel}>Cover Letter (optional)</Text>
                <TextInput
                  value={coverLetter}
                  onChangeText={setCoverLetter}
                  placeholder="Why are you the right operator for this role?"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  multiline
                  numberOfLines={5}
                  style={[styles.coverInput, { color: "#fff" }]}
                />
              </ScrollView>
              <TouchableOpacity
                onPress={handleApply}
                disabled={applyMutation.isPending}
                style={[styles.applyBtn, applyMutation.isPending && { opacity: 0.6 }]}
              >
                {applyMutation.isPending ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.applyBtnText}>Apply Now</Text>
                )}
              </TouchableOpacity>
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
  },
  superLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(232,117,74,0.50)", letterSpacing: 2 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.3 },
  controls: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(100,180,220,0.12)" },
  tabRow: { flexDirection: "row", gap: 8 },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tabBtnActive: { backgroundColor: "#E8754A", borderColor: "#E8754A" },
  tabText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.45)" },
  tabTextActive: { color: "#000" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.20)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  card: {
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.15)",
    padding: 14,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.015)",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  companyAvatar: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(100,180,220,0.12)",
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  companyInitial: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#E8754A" },
  cardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.9)" },
  cardCompany: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", marginTop: 1 },
  typeBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  skillChip: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  skillText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)" },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  matchText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#E8754A" },
  loader: { paddingTop: 60, alignItems: "center" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.22)", textAlign: "center", maxWidth: 260 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.75)" },
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
  jobMetaRow: { gap: 2 },
  jobCompany: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#E8754A" },
  jobLocation: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },
  jobDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", lineHeight: 19 },
  coverLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(201,168,76,0.6)", letterSpacing: 1.5, textTransform: "uppercase" },
  coverInput: {
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.20)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 100,
    textAlignVertical: "top",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  applyBtn: {
    backgroundColor: "#E8754A",
    margin: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.8, textTransform: "uppercase" },
});
