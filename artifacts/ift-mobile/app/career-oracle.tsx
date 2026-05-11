import { Ionicons } from "@expo/vector-icons";
import {
  useGetCareerOracle,
  type CareerOracleResult,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE } from "../lib/api-base";

const PRIMARY = "#E8754A";
const DANGER = "#DC143C";
const BORDER = "rgba(232,117,74,0.18)";
const CARD_BG = "rgba(15,25,60,0.42)";

const ROLE_EXAMPLES = [
  "VP of Engineering",
  "Lead Product Designer",
  "Chief Revenue Officer",
  "AI Research Scientist",
];

const priorityColor: Record<string, string> = {
  high: DANGER,
  medium: PRIMARY,
  low: "rgba(255,255,255,0.45)",
};

export default function CareerOracleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const [tier, setTier] = useState<string | null>(null);
  const [tierLoaded, setTierLoaded] = useState(false);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const r = await fetch(`${API_BASE}/api/billing/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          setTier(j?.tier ?? "recruit");
        } else {
          setTier("recruit");
        }
      } catch {
        if (!cancelled) setTier("recruit");
      } finally {
        if (!cancelled) setTierLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const isPremium = tier === "operator" || tier === "enterprise";

  const [targetRole, setTargetRole] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [experienceInput, setExperienceInput] = useState("");
  const [submittedRole, setSubmittedRole] = useState("");
  const [result, setResult] = useState<CareerOracleResult | null>(null);

  const oracle = useGetCareerOracle();
  const isLoading = oracle.isPending;

  const handleCopy = async () => {
    if (!result) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines: string[] = [];
    lines.push(`# Career Oracle — ${submittedRole}`);
    if (result.skillGaps?.length) {
      lines.push(`\n## Critical Gaps`);
      result.skillGaps.forEach((g) => lines.push(`- [${g.priority?.toUpperCase()}] ${g.skill}`));
    }
    if (result.roadmap?.length) {
      lines.push(`\n## Roadmap`);
      result.roadmap.forEach((s) => lines.push(`${s.step}. ${s.title} — ${s.description}`));
    }
    if (result.jobSuggestions?.length) {
      lines.push(`\n## Suggested Roles`);
      result.jobSuggestions.forEach((s) => lines.push(`- ${s}`));
    }
    if (result.marketTrends?.length) {
      lines.push(`\n## Market Intel`);
      result.marketTrends.forEach((t) => lines.push(`- ${t}`));
    }
    await Clipboard.setStringAsync(lines.join("\n"));
    setCopiedAt(Date.now());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedAt(null), 1800);
  };

  const handleSubmit = async () => {
    if (!targetRole.trim() || isLoading) return;
    if (!isPremium) return;
    setSubmittedRole(targetRole.trim());
    const skills = skillsInput.split(",").map((s) => s.trim()).filter(Boolean);
    const experience = experienceInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [titlePart, ...rest] = line.split(" at ");
        return {
          title: (titlePart ?? "").trim() || "Role",
          company: rest.join(" at ").trim() || "Company",
          current: false,
          startDate: "",
        };
      });
    try {
      const res = await oracle.mutateAsync({ data: { targetRole: targetRole.trim(), skills, experience } });
      setResult(res);
    } catch {
      // Errors are reflected via oracle.isError
    }
  };

  const handleReset = () => {
    setResult(null);
    setSubmittedRole("");
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
          <Text style={styles.superLabel}>INTELLIGENCE</Text>
          <Text style={styles.headerTitle}>CAREER ORACLE</Text>
        </View>
        {result && (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity onPress={handleCopy} hitSlop={12} style={styles.resetBtn}>
              <Ionicons name={copiedAt ? "checkmark" : "copy-outline"} size={14} color={PRIMARY} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReset} hitSlop={12} style={styles.resetBtn}>
              <Ionicons name="refresh" size={14} color={PRIMARY} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: Math.max(insets.bottom + 20, 40) }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.tagline}>{">"} AI-powered path analysis · No sugarcoating</Text>

        {tierLoaded && !isPremium ? (
          <View style={styles.premiumGate}>
            <Ionicons name="diamond" size={20} color={PRIMARY} />
            <Text style={styles.premiumTitle}>OPERATOR-ONLY INTEL</Text>
            <Text style={styles.premiumSub}>
              The Oracle's brutal-truth analysis is reserved for Operator tier and above.
              Upgrade to unlock unlimited career paths, market trends, and skill-gap reports.
            </Text>
            <TouchableOpacity
              style={styles.premiumCta}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/pricing");
              }}
            >
              <Text style={styles.premiumCtaText}>UPGRADE TO OPERATOR</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Input Panel */}
        <View style={styles.inputPanel}>
          <Text style={styles.terminalLine}>$ oracle --analyze --target=...</Text>
          <TextInput
            value={targetRole}
            onChangeText={setTargetRole}
            placeholder="Target role (e.g. VP of Engineering)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={styles.input}
          />
          <TextInput
            value={skillsInput}
            onChangeText={setSkillsInput}
            placeholder="Your current skills (comma-separated)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={styles.input}
          />
          <TextInput
            value={experienceInput}
            onChangeText={setExperienceInput}
            placeholder={'Experience (one per line, e.g. "Senior Engineer at Acme")'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={[styles.input, { height: 70, textAlignVertical: "top" }]}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.runBtn,
              (!targetRole.trim() || isLoading || !isPremium) && styles.runBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!targetRole.trim() || isLoading || !isPremium}
            activeOpacity={0.8}
          >
            <Text style={styles.runBtnText}>
              {isLoading ? "ANALYZING..." : !isPremium && tierLoaded ? "OPERATOR ONLY" : "RUN ANALYSIS"}
            </Text>
          </TouchableOpacity>
          <View style={styles.examplesRow}>
            {ROLE_EXAMPLES.map((r) => (
              <TouchableOpacity key={r} onPress={() => setTargetRole(r)} style={styles.exampleChip}>
                <Ionicons name="chevron-forward" size={9} color="rgba(232,117,74,0.5)" />
                <Text style={styles.exampleText}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Loading */}
        {isLoading && (
          <View style={styles.section}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.loadingText}>{">"} Scanning professional landscape...</Text>
            <Text style={styles.loadingText}>{">"} Cross-referencing market data...</Text>
            <Text style={styles.loadingText}>{">"} Computing gap analysis...</Text>
          </View>
        )}

        {/* Results */}
        {result && !isLoading && (
          <>
            <View style={styles.targetCard}>
              <Ionicons name="sparkles" size={14} color={PRIMARY} />
              <View style={{ flex: 1 }}>
                <Text style={styles.targetLabel}>TARGET ACQUIRED</Text>
                <Text style={styles.targetRole}>{submittedRole}</Text>
              </View>
            </View>

            {/* Skill Gaps */}
            {result.skillGaps.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="warning" size={13} color={DANGER} />
                  <Text style={[styles.sectionTitle, { color: DANGER }]}>CRITICAL GAPS — BRUTAL TRUTH</Text>
                </View>
                {result.skillGaps.map((gap, i) => (
                  <View key={i} style={styles.gapItem}>
                    <View style={styles.gapHeader}>
                      <Text style={styles.gapSkill}>{gap.skill}</Text>
                      <Text style={[styles.gapPriority, { color: priorityColor[gap.priority] ?? "rgba(255,255,255,0.4)" }]}>
                        [{gap.priority?.toUpperCase()}]
                      </Text>
                    </View>
                    {gap.resources?.length > 0 && (
                      <View style={styles.tagRow}>
                        {gap.resources.map((r) => (
                          <View key={r} style={styles.tag}>
                            <Text style={styles.tagText}>{r}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Roadmap */}
            {result.roadmap.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="trending-up" size={13} color={PRIMARY} />
                  <Text style={styles.sectionTitle}>EXECUTION ROADMAP</Text>
                </View>
                {result.roadmap.map((step, i) => (
                  <View key={i} style={styles.roadmapItem}>
                    <View style={styles.roadmapNum}>
                      <Text style={styles.roadmapNumText}>{String(step.step).padStart(2, "0")}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.roadmapTitleRow}>
                        <Text style={styles.roadmapTitle}>{step.title}</Text>
                        {step.timeframe && (
                          <Text style={styles.roadmapTime}>[{step.timeframe}]</Text>
                        )}
                      </View>
                      <Text style={styles.roadmapDesc}>{step.description}</Text>
                      {step.skills?.length > 0 && (
                        <View style={styles.tagRow}>
                          {step.skills.map((s) => (
                            <View key={s} style={styles.tag}>
                              <Text style={styles.tagText}>{s}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Suggestions */}
            {result.jobSuggestions.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="bulb" size={13} color={PRIMARY} />
                  <Text style={styles.sectionTitle}>SUGGESTED ROLES</Text>
                </View>
                {result.jobSuggestions.map((s, i) => (
                  <View key={i} style={styles.suggestionItem}>
                    <Ionicons name="chevron-forward" size={11} color="rgba(232,117,74,0.45)" />
                    <Text style={styles.suggestionText}>{s}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Market Trends */}
            {result.marketTrends.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="bar-chart" size={13} color={PRIMARY} />
                  <Text style={styles.sectionTitle}>MARKET INTEL</Text>
                </View>
                {result.marketTrends.map((trend, i) => (
                  <View key={i} style={styles.trendRow}>
                    <Text style={styles.trendArrow}>{">"}</Text>
                    <Text style={styles.trendText}>{trend}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {!submittedRole && !isLoading && (
          <View style={styles.empty}>
            <Ionicons name="sparkles-outline" size={28} color="rgba(232,117,74,0.4)" />
            <Text style={styles.emptyText}>{">"} Enter a target role above</Text>
            <Text style={styles.emptyText}>{">"} The Oracle delivers your reality check</Text>
          </View>
        )}
      </ScrollView>
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
  resetBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
  },
  tagline: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 },
  inputPanel: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  terminalLine: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(232,117,74,0.5)", marginBottom: 4 },
  input: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.18)",
    color: "#fff",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 4,
  },
  runBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 11,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 4,
  },
  runBtnDisabled: { opacity: 0.4 },
  runBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 1 },
  examplesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  exampleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.15)",
    borderRadius: 3,
  },
  exampleText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)" },
  section: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: PRIMARY, letterSpacing: 1.2 },
  loadingText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  targetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: PRIMARY,
    borderRadius: 8,
    padding: 12,
  },
  targetLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(232,117,74,0.6)", letterSpacing: 1.5 },
  targetRole: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff", marginTop: 2, letterSpacing: 0.3 },
  gapItem: { paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(232,117,74,0.08)" },
  gapHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  gapSkill: { fontSize: 12, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.85)" },
  gapPriority: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.15)",
    borderRadius: 3,
  },
  tagText: { fontSize: 9, fontFamily: "Inter_500Medium", color: "rgba(232,117,74,0.6)", letterSpacing: 0.3 },
  roadmapItem: { flexDirection: "row", gap: 10, paddingBottom: 6 },
  roadmapNum: {
    width: 28, height: 28, borderRadius: 4,
    borderWidth: 1, borderColor: "rgba(232,117,74,0.3)",
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  roadmapNumText: { fontSize: 10, fontFamily: "Inter_700Bold", color: PRIMARY },
  roadmapTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  roadmapTitle: { fontSize: 12, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.85)" },
  roadmapTime: { fontSize: 9, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 },
  roadmapDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", lineHeight: 15, marginTop: 3 },
  suggestionItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  suggestionText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
  trendRow: { flexDirection: "row", gap: 6 },
  trendArrow: { fontSize: 11, fontFamily: "Inter_700Bold", color: "rgba(232,117,74,0.45)" },
  trendText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", flex: 1, lineHeight: 16 },
  empty: { paddingTop: 30, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)" },
  premiumGate: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: PRIMARY + "55",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  premiumTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: PRIMARY, letterSpacing: 1.5 },
  premiumSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 17,
  },
  premiumCta: {
    marginTop: 4,
    backgroundColor: PRIMARY,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
  },
  premiumCtaText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 1 },
});
