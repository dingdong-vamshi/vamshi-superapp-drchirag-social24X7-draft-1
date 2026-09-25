import { useCallback, useEffect, useMemo, useState } from "react";
import * as Clipboard from "expo-clipboard";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Copy,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserRoundCog,
  Users,
  X,
} from "lucide-react-native";
import type { TeamRepository } from "./teamRepository";
import {
  normalizeBusinessLoginId,
  teamStatusLabel,
  validateTeamInvitation,
} from "./rules";
import type {
  TeamDashboard,
  TeamInvitationInput,
  TeamMember,
  TeamMemberMetrics,
  TeamMemberStatus,
  TeamPermissionCode,
  TeamRole,
} from "./types";
import type {
  WorkConversation,
  WorkMessage,
} from "../businessWorkspace/businessWorkspaceRepository";

type Props = { storefrontId: string; repository: TeamRepository };
type Filter = "all" | TeamMemberStatus;

const green = "#087a49";
const mint = "#eef8f3";
const ink = "#102133";
const muted = "#63758b";
const line = "#dde7e1";

const emptyInvite = (
  storefrontId: string,
  roleId = "",
): TeamInvitationInput => ({
  storefrontId,
  fullName: "",
  workEmail: "",
  loginId: "",
  customerTagline: "",
  jobTitle: "",
  employeeId: "",
  department: "",
  roleId,
  permissions: null,
});

const statusTone: Record<
  TeamMemberStatus,
  { background: string; color: string }
> = {
  verified: { background: "#e5f8ed", color: "#087a49" },
  awaiting_approval: { background: "#fff4d7", color: "#9a5a00" },
  not_activated: { background: "#edf2f7", color: "#53657a" },
  suspended: { background: "#fff0e5", color: "#a54812" },
  removed: { background: "#f6e9ea", color: "#a32b38" },
};

export default function TeamManagementPanel({
  storefrontId,
  repository,
}: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [dashboard, setDashboard] = useState<TeamDashboard | null>(null);
  const [metrics, setMetrics] = useState<TeamMemberMetrics[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<TeamInvitationInput>(
    emptyInvite(storefrontId),
  );
  const [activation, setActivation] = useState<{
    loginId: string;
    code: string;
    expiresAt: string;
  } | null>(null);
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDashboard, nextMetrics] = await Promise.all([
        repository.getDashboard(storefrontId),
        repository.getMetrics(storefrontId),
      ]);
      setDashboard(nextDashboard);
      setMetrics(nextMetrics);
      setInvite((current) => ({
        ...current,
        storefrontId,
        roleId:
          current.roleId ||
          nextDashboard.roles.find((role) => role.systemKey === "agent")?.id ||
          nextDashboard.roles[0]?.id ||
          "",
        customerTagline:
          current.customerTagline || `from ${nextDashboard.storefront.name}`,
      }));
      setSelected((current) =>
        current
          ? (nextDashboard.members.find((member) => member.id === current.id) ??
            null)
          : null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Team workspace could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [repository, storefrontId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleMembers = useMemo(
    () =>
      (dashboard?.members ?? []).filter(
        (member) => filter === "all" || member.status === filter,
      ),
    [dashboard, filter],
  );
  const metricFor = (memberId: string) =>
    metrics.find((item) => item.membershipId === memberId);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      Alert.alert("Team updated", success);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The team update failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitInvite = async () => {
    const validation = validateTeamInvitation(invite);
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await repository.invite({
        ...invite,
        loginId: validation.loginId,
        workEmail: invite.workEmail.trim().toLocaleLowerCase(),
      });
      setActivation({
        loginId: validation.loginId,
        code: result.activationCode,
        expiresAt: result.expiresAt,
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The invitation could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading && !dashboard) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={green} />
        <Text style={styles.stateText}>Loading the secure team workspace…</Text>
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={styles.state}>
        <Text style={styles.error}>
          {error ?? "Team workspace unavailable."}
        </Text>
        <Action label="Try again" onPress={() => void load()} />
      </View>
    );
  }

  const countCards = [
    [
      "Verified members",
      dashboard.counts.verified,
      "Blue tick visible",
      UserCheck,
    ],
    [
      "Awaiting approval",
      dashboard.counts.awaitingApproval,
      "Needs owner review",
      ShieldCheck,
    ],
    ["Not activated", dashboard.counts.notActivated, "Password not set", Users],
    [
      "Suspended",
      dashboard.counts.suspended,
      "Chat access removed",
      UserRoundCog,
    ],
  ] as const;

  return (
    <View style={styles.root}>
      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.brandMark}>
          <BriefcaseBusiness size={25} color="#ffffff" />
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{dashboard.storefront.name}</Text>
            {dashboard.storefront.verified ? (
              <BadgeCheck size={20} color="#147ac6" fill="#e3f2ff" />
            ) : null}
          </View>
          <Text style={styles.subtitle}>
            Team & verification · separate work identities and assigned customer
            chats
          </Text>
          <Text style={styles.verificationCopy}>
            {dashboard.storefront.verified
              ? "Verified company profile. Approved representatives show a blue tick in customer chats."
              : `Company status: ${dashboard.storefront.verificationStatus}`}
          </Text>
        </View>
        <View
          style={[styles.heroActions, compact && styles.heroActionsCompact]}
        >
          <Action label="Roles" onPress={() => setRolesOpen(true)} secondary />
          <Action
            label="Add member"
            icon={<Plus size={16} color="#ffffff" />}
            onPress={() => {
              setActivation(null);
              setInviteOpen(true);
            }}
          />
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => setError(null)}>
            <X size={16} color="#a52a36" />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.metrics, compact && styles.metricsCompact]}>
        {countCards.map(([label, value, copy, Icon]) => (
          <View
            key={label}
            style={[styles.metricCard, compact && styles.metricCardCompact]}
          >
            <View style={styles.metricIcon}>
              <Icon size={18} color={green} />
            </View>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
            <Text style={styles.metricCopy}>{copy}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Team members</Text>
          <Text style={styles.sectionCopy}>
            Only verified members can represent this business in assigned chats.
          </Text>
        </View>
        <Pressable onPress={() => void load()} style={styles.refresh}>
          <RefreshCw size={15} color={green} />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {(
          [
            "all",
            "verified",
            "awaiting_approval",
            "not_activated",
            "suspended",
            "removed",
          ] as Filter[]
        ).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={`${item === "all" ? "All" : teamStatusLabel[item]} members`}
            accessibilityState={{ selected: filter === item }}
            onPress={() => setFilter(item)}
            style={[styles.filter, filter === item && styles.filterActive]}
          >
            <Text
              style={[
                styles.filterText,
                filter === item && styles.filterTextActive,
              ]}
            >
              {item === "all"
                ? `All ${dashboard.members.length}`
                : teamStatusLabel[item]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.memberList}>
        {visibleMembers.map((member) => {
          const metric = metricFor(member.id);
          const tone = statusTone[member.status];
          return (
            <Pressable
              key={member.id}
              accessibilityRole="button"
              accessibilityLabel={`Open team member ${member.fullName}`}
              onPress={() => setSelected(member)}
              style={[styles.memberRow, compact && styles.memberRowCompact]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {member.fullName.slice(0, 1).toUpperCase()}
                </Text>
                {member.representativeVerified ? (
                  <View style={styles.avatarBadge}>
                    <BadgeCheck size={14} color="#147ac6" fill="#ffffff" />
                  </View>
                ) : null}
              </View>
              <View style={styles.memberIdentity}>
                <View style={styles.nameRow}>
                  <Text style={styles.memberName}>{member.fullName}</Text>
                  {member.roleKey === "owner" ? (
                    <Text style={styles.ownerBadge}>OWNER</Text>
                  ) : null}
                </View>
                <Text style={styles.memberMeta}>
                  {member.jobTitle} · {member.department} · {member.loginId}
                </Text>
                <Text style={styles.memberTagline}>
                  {member.customerTagline}
                </Text>
              </View>
              <View style={styles.chatMetric}>
                <Text style={styles.chatMetricValue}>
                  {metric?.openChats ?? 0}
                </Text>
                <Text style={styles.chatMetricLabel}>open chats</Text>
              </View>
              <View
                style={[styles.status, { backgroundColor: tone.background }]}
              >
                <Text style={[styles.statusText, { color: tone.color }]}>
                  {teamStatusLabel[member.status]}
                </Text>
              </View>
              {member.status === "awaiting_approval" ? (
                <Action
                  small
                  label="Approve"
                  disabled={busy}
                  onPress={() =>
                    void run(
                      () => repository.approve(member.id),
                      `${member.fullName} is now a verified representative.`,
                    )
                  }
                />
              ) : null}
            </Pressable>
          );
        })}
        {!visibleMembers.length ? (
          <Text style={styles.empty}>No members match this filter.</Text>
        ) : null}
      </View>

      <View style={styles.auditCard}>
        <Text style={styles.sectionTitle}>Recent security activity</Text>
        {dashboard.auditEvents.slice(0, 8).map((event) => (
          <View key={event.id} style={styles.auditRow}>
            <Text style={styles.auditType}>
              {event.eventType.replaceAll("_", " ")}
            </Text>
            <Text style={styles.auditDate}>
              {new Date(event.createdAt).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>

      <InviteModal
        open={inviteOpen}
        dashboard={dashboard}
        invite={invite}
        setInvite={setInvite}
        activation={activation}
        busy={busy}
        onClose={() => setInviteOpen(false)}
        onSubmit={() => void submitInvite()}
      />
      <MemberModal
        member={selected}
        members={dashboard.members}
        roles={dashboard.roles}
        repository={repository}
        metric={selected ? metricFor(selected.id) : undefined}
        busy={busy}
        onClose={() => setSelected(null)}
        onApprove={(member) =>
          void run(
            () => repository.approve(member.id),
            `${member.fullName} is now verified.`,
          )
        }
        onResend={async (member) => {
          setBusy(true);
          try {
            const result = await repository.resend(member.id);
            setActivation({
              loginId: member.loginId,
              code: result.activationCode,
              expiresAt: result.expiresAt,
            });
            setInviteOpen(true);
            setSelected(null);
            await load();
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Could not resend code.",
            );
          } finally {
            setBusy(false);
          }
        }}
        onTransition={(member, action) =>
          void run(
            () => repository.transition(member.id, action),
            `${member.fullName}'s access was updated.`,
          )
        }
        onError={setError}
        onChanged={() => void load()}
      />
      <RolesModal
        open={rolesOpen}
        dashboard={dashboard}
        repository={repository}
        busy={busy}
        setBusy={setBusy}
        onClose={() => setRolesOpen(false)}
        onChanged={() => void load()}
        onError={setError}
      />
    </View>
  );
}

function Action({
  label,
  onPress,
  secondary,
  small,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  small?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        secondary && styles.actionSecondary,
        small && styles.actionSmall,
        disabled && styles.disabled,
      ]}
    >
      {icon}
      <Text
        style={[styles.actionText, secondary && styles.actionSecondaryText]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  stacked,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  stacked?: boolean;
}) {
  return (
    <View style={[styles.field, stacked && styles.fieldStacked]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#91a0ae"
        style={styles.input}
      />
    </View>
  );
}

function InviteModal({
  open,
  dashboard,
  invite,
  setInvite,
  activation,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  dashboard: TeamDashboard;
  invite: TeamInvitationInput;
  setInvite: React.Dispatch<React.SetStateAction<TeamInvitationInput>>;
  activation: { loginId: string; code: string; expiresAt: string } | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const patch = (key: keyof TeamInvitationInput, value: string) =>
    setInvite((current) => ({ ...current, [key]: value }));
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalScrim}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {activation ? "Activation ready" : "Add team member"}
                </Text>
                <Text style={styles.modalCopy}>
                  {activation
                    ? "Share these credentials securely. The code expires and works once."
                    : "Create a separate company work identity—never reuse a personal Social24 account."}
                </Text>
              </View>
              <Pressable onPress={onClose}>
                <X size={21} color={ink} />
              </Pressable>
            </View>
            {activation ? (
              <View style={styles.activationBox}>
                <Credential
                  label="Business login ID"
                  value={activation.loginId}
                />
                <Credential
                  label="One-time activation code"
                  value={activation.code}
                />
                <Text style={styles.activationExpiry}>
                  Expires {new Date(activation.expiresAt).toLocaleString()}
                </Text>
                <Action
                  label="Copy activation message"
                  icon={<Copy size={15} color="#ffffff" />}
                  onPress={() =>
                    void Clipboard.setStringAsync(
                      `Social24 business work account\nLogin ID: ${activation.loginId}\nActivation code: ${activation.code}\nOpen /business-activate and create your password. Code expires ${new Date(activation.expiresAt).toLocaleString()}.`,
                    )
                  }
                />
              </View>
            ) : (
              <>
                <View style={styles.formGrid}>
                  <Field
                    label="Full name"
                    value={invite.fullName}
                    onChangeText={(value) => patch("fullName", value)}
                  />
                  <Field
                    label="Work email"
                    value={invite.workEmail}
                    onChangeText={(value) => patch("workEmail", value)}
                  />
                  <Field
                    label="Business login ID"
                    value={invite.loginId}
                    onChangeText={(value) =>
                      patch("loginId", normalizeBusinessLoginId(value))
                    }
                    placeholder="kavya.support"
                  />
                  <Field
                    label="Customer tagline"
                    value={invite.customerTagline}
                    onChangeText={(value) => patch("customerTagline", value)}
                  />
                  <Field
                    label="Job title"
                    value={invite.jobTitle}
                    onChangeText={(value) => patch("jobTitle", value)}
                  />
                  <Field
                    label="Department"
                    value={invite.department}
                    onChangeText={(value) => patch("department", value)}
                  />
                  <Field
                    label="Employee ID (optional)"
                    value={invite.employeeId}
                    onChangeText={(value) => patch("employeeId", value)}
                  />
                </View>
                <Text style={styles.fieldLabel}>Role</Text>
                <View style={styles.roleChoices}>
                  {dashboard.roles.map((role) => (
                    <Pressable
                      key={role.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${role.name} role`}
                      accessibilityState={{ selected: invite.roleId === role.id }}
                      onPress={() => patch("roleId", role.id)}
                      style={[
                        styles.roleChoice,
                        invite.roleId === role.id && styles.roleChoiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleChoiceText,
                          invite.roleId === role.id &&
                            styles.roleChoiceTextActive,
                        ]}
                      >
                        {role.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Action
                  label={busy ? "Creating…" : "Create work login"}
                  disabled={busy}
                  onPress={onSubmit}
                />
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.credential}>
      <View>
        <Text style={styles.credentialLabel}>{label}</Text>
        <Text selectable style={styles.credentialValue}>
          {value}
        </Text>
      </View>
      <Pressable onPress={() => void Clipboard.setStringAsync(value)}>
        <Copy size={18} color={green} />
      </Pressable>
    </View>
  );
}

function MemberModal({
  member,
  members,
  roles,
  repository,
  metric,
  busy,
  onClose,
  onApprove,
  onResend,
  onTransition,
  onError,
  onChanged,
}: {
  member: TeamMember | null;
  members: TeamMember[];
  roles: TeamRole[];
  repository: TeamRepository;
  metric?: TeamMemberMetrics;
  busy: boolean;
  onClose: () => void;
  onApprove: (member: TeamMember) => void;
  onResend: (member: TeamMember) => void;
  onTransition: (
    member: TeamMember,
    action: "suspend" | "reactivate" | "remove",
  ) => void;
  onError: (message: string | null) => void;
  onChanged: () => void;
}) {
  const [conversations, setConversations] = useState<WorkConversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<WorkConversation | null>(null);
  const [messages, setMessages] = useState<WorkMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [editRoleId, setEditRoleId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState(false);

  useEffect(() => {
    setEditRoleId(member?.roleId ?? "");
    setEditTitle(member?.jobTitle ?? "");
    setEditDepartment(member?.department ?? "");
    setEditTagline(member?.customerTagline ?? "");
    setConfirmRemoval(false);
    setSelectedConversation(null);
    setMessages([]);
    if (!member) {
      setConversations([]);
      return;
    }
    let active = true;
    setChatBusy(true);
    void repository
      .listSupervisedConversations()
      .then((rows) => {
        if (!active) return;
        const assigned = rows.filter(
          (conversation) => conversation.assigneeMembershipId === member.id,
        );
        setConversations(assigned);
        setSelectedConversation(assigned[0] ?? null);
      })
      .catch((cause) =>
        onError(
          cause instanceof Error
            ? cause.message
            : "Employee conversations could not be loaded.",
        ),
      )
      .finally(() => {
        if (active) setChatBusy(false);
      });
    return () => {
      active = false;
    };
  }, [member?.id, repository, onError]);

  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      return;
    }
    let active = true;
    setChatBusy(true);
    void repository
      .listSupervisedMessages(selectedConversation.conversationId)
      .then((rows) => {
        if (active) setMessages(rows);
      })
      .catch((cause) =>
        onError(
          cause instanceof Error ? cause.message : "Chat history could not be loaded.",
        ),
      )
      .finally(() => {
        if (active) setChatBusy(false);
      });
    return () => {
      active = false;
    };
  }, [selectedConversation?.conversationId, repository, onError]);

  if (!member) return null;
  const reassignable = members.filter(
    (candidate) =>
      candidate.id !== member.id &&
      candidate.status === "verified" &&
      candidate.permissions.includes("business_chat_reply"),
  );
  const reassign = async (target: TeamMember) => {
    if (!selectedConversation) return;
    setChatBusy(true);
    try {
      await repository.reassignConversation(
        selectedConversation.conversationId,
        target.id,
      );
      setConversations((current) =>
        current.filter(
          (conversation) =>
            conversation.conversationId !== selectedConversation.conversationId,
        ),
      );
      setSelectedConversation(null);
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Conversation could not be reassigned.",
      );
    } finally {
      setChatBusy(false);
    }
  };
  const saveProfile = async () => {
    if (!member || !editRoleId || !editTitle.trim() || !editDepartment.trim() || !editTagline.trim()) return;
    const selectedRole = roles.find((role) => role.id === editRoleId);
    if (!selectedRole) return;
    setChatBusy(true);
    try {
      await repository.updateMember({
        memberId: member.id,
        roleId: editRoleId,
        fullName: member.fullName,
        customerTagline: editTagline,
        jobTitle: editTitle,
        department: editDepartment,
        permissions: selectedRole.permissions,
      });
      onChanged();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Member profile could not be updated.");
    } finally {
      setChatBusy(false);
    }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={styles.modalCardWide}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{member.fullName}</Text>
              <Text style={styles.modalCopy}>
                {member.roleName} · {member.jobTitle}
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <X size={21} color={ink} />
            </Pressable>
          </View>
          <View style={styles.memberDetailGrid}>
            <Detail label="Status" value={teamStatusLabel[member.status]} />
            <Detail label="Login ID" value={member.loginId} />
            <Detail label="Open chats" value={String(metric?.openChats ?? 0)} />
            <Detail
              label="Lifetime chats"
              value={String(metric?.lifetimeChats ?? 0)}
            />
          </View>
          {member.identityKind === "work" ? (
            <View style={styles.memberEditor}>
              <Field label="Customer-facing job title" value={editTitle} onChangeText={setEditTitle} />
              <Field label="Department" value={editDepartment} onChangeText={setEditDepartment} />
              <Field label="Customer tagline" value={editTagline} onChangeText={setEditTagline} />
              <View style={styles.memberRoleEditor}>
                <Text style={styles.fieldLabel}>Role</Text>
                <View style={styles.roleChoices}>
                  {roles.map((role) => (
                    <Pressable
                      key={role.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${role.name} role for ${member.fullName}`}
                      accessibilityState={{ selected: editRoleId === role.id }}
                      onPress={() => setEditRoleId(role.id)}
                      style={[
                        styles.roleChoice,
                        editRoleId === role.id && styles.roleChoiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleChoiceText,
                          editRoleId === role.id && styles.roleChoiceTextActive,
                        ]}
                      >
                        {role.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Action
                  label={chatBusy ? "Saving…" : "Save role & profile"}
                  small
                  disabled={chatBusy}
                  onPress={() => void saveProfile()}
                />
              </View>
            </View>
          ) : null}
          <Text style={styles.permissionTitle}>Effective permissions</Text>
          <View style={styles.permissionList}>
            {member.permissions.map((permission) => (
              <Text key={permission} style={styles.permissionPill}>
                {permission.replaceAll("business_", "").replaceAll("_", " ")}
              </Text>
            ))}
          </View>
          <Text style={styles.permissionTitle}>Assigned customer chats</Text>
          <View style={styles.supervisorDesk}>
            <ScrollView style={styles.supervisorConversationList}>
              {conversations.map((conversation) => (
                <Pressable
                  key={conversation.conversationId}
                  accessibilityRole="button"
                  accessibilityLabel={`Monitor chat with ${conversation.customerDisplayName}`}
                  accessibilityState={{ selected: selectedConversation?.conversationId === conversation.conversationId }}
                  onPress={() => setSelectedConversation(conversation)}
                  style={[
                    styles.supervisorConversation,
                    selectedConversation?.conversationId ===
                      conversation.conversationId &&
                      styles.supervisorConversationActive,
                  ]}
                >
                  <Text style={styles.supervisorConversationName}>
                    {conversation.customerDisplayName}
                  </Text>
                  <Text style={styles.supervisorConversationCopy} numberOfLines={1}>
                    {conversation.lastMessage}
                  </Text>
                  <Text style={styles.supervisorConversationMeta}>
                    {conversation.workStatus} · privacy-safe customer view
                  </Text>
                </Pressable>
              ))}
              {!conversations.length && !chatBusy ? (
                <Text style={styles.supervisorEmpty}>No chats assigned to this member.</Text>
              ) : null}
            </ScrollView>
            <View style={styles.supervisorThread}>
              {chatBusy ? <ActivityIndicator color={green} /> : null}
              {selectedConversation ? (
                <>
                  <Text style={styles.supervisorThreadTitle}>
                    {selectedConversation.customerDisplayName}
                  </Text>
                  <ScrollView style={styles.supervisorMessages}>
                    {messages.map((message) => (
                      <View key={message.messageId} style={styles.supervisorMessage}>
                        <View style={styles.supervisorSenderRow}>
                          <Text style={styles.supervisorSender}>
                            {message.senderDisplayName}
                          </Text>
                          {message.representativeVerified ? (
                            <BadgeCheck size={13} color="#147ac6" />
                          ) : null}
                        </View>
                        {message.senderTagline ? (
                          <Text style={styles.supervisorTagline}>
                            {message.senderTagline}
                          </Text>
                        ) : null}
                        <Text style={styles.supervisorBody}>{message.body}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  {reassignable.length ? (
                    <View style={styles.reassignRow}>
                      <Text style={styles.reassignLabel}>Reassign to</Text>
                      {reassignable.map((candidate) => (
                        <Pressable
                          key={candidate.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Reassign conversation to ${candidate.fullName}`}
                          accessibilityState={{ disabled: chatBusy }}
                          disabled={chatBusy}
                          onPress={() => void reassign(candidate)}
                          style={styles.reassignButton}
                        >
                          <Text style={styles.reassignButtonText}>
                            {candidate.fullName}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={styles.supervisorEmpty}>
                  Select a chat to monitor its complete business history.
                </Text>
              )}
            </View>
          </View>
          {member.identityKind === "work" ? (
            <View style={styles.modalActions}>
              {member.status === "awaiting_approval" ? (
                <Action
                  label="Approve"
                  disabled={busy}
                  onPress={() => onApprove(member)}
                />
              ) : null}
              {member.status === "not_activated" ? (
                <Action
                  label="Resend activation"
                  disabled={busy}
                  onPress={() => onResend(member)}
                />
              ) : null}
              {member.status === "verified" ? (
                <Action
                  label="Suspend"
                  secondary
                  disabled={busy}
                  onPress={() => onTransition(member, "suspend")}
                />
              ) : null}
              {member.status === "suspended" ? (
                <Action
                  label="Reactivate"
                  disabled={busy}
                  onPress={() => onTransition(member, "reactivate")}
                />
              ) : null}
              {member.status !== "removed" ? (
                confirmRemoval ? (
                  <View style={styles.removalConfirmation}>
                    <Text style={styles.removalConfirmationText}>
                      Remove this member? Historical messages stay attributed, but company access ends immediately.
                    </Text>
                    <View style={styles.removalConfirmationActions}>
                      <Action
                        label="Cancel removal"
                        secondary
                        small
                        disabled={busy}
                        onPress={() => setConfirmRemoval(false)}
                      />
                      <Action
                        label="Confirm remove member"
                        small
                        disabled={busy}
                        onPress={() => {
                          setConfirmRemoval(false);
                          onTransition(member, "remove");
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <Action
                    label="Remove"
                    secondary
                    disabled={busy}
                    onPress={() => setConfirmRemoval(true)}
                  />
                )
              ) : null}
            </View>
          ) : (
            <Text style={styles.ownerNote}>
              The root Owner identity is protected.
            </Text>
          )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function RolesModal({
  open,
  dashboard,
  repository,
  busy,
  setBusy,
  onClose,
  onChanged,
  onError,
}: {
  open: boolean;
  dashboard: TeamDashboard;
  repository: TeamRepository;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onClose: () => void;
  onChanged: () => void;
  onError: (value: string | null) => void;
}) {
  const [selected, setSelected] = useState<TeamRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<TeamPermissionCode[]>([]);
  const choose = (role?: TeamRole) => {
    setSelected(role ?? null);
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissions(role?.permissions ?? []);
  };
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (selected)
        await repository.updateRole({
          roleId: selected.id,
          name,
          description,
          permissions,
        });
      else
        await repository.createRole({
          storefrontId: dashboard.storefront.id,
          name,
          description,
          permissions,
        });
      onChanged();
      choose();
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Role could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalScrim}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={styles.modalCardWide}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Roles & permissions</Text>
                <Text style={styles.modalCopy}>
                  Custom roles stay inside {dashboard.storefront.name}.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close roles and permissions"
                onPress={onClose}
              >
                <X size={21} color={ink} />
              </Pressable>
            </View>
            <View style={styles.roleManager}>
              <View style={styles.roleRail}>
                <Action
                  label="New custom role"
                  small
                  onPress={() => choose()}
                />
                {dashboard.roles.map((role) => (
                  <Pressable
                    key={role.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit role ${role.name}`}
                    accessibilityState={{ selected: selected?.id === role.id }}
                    onPress={() => choose(role)}
                    style={[
                      styles.roleRailItem,
                      selected?.id === role.id && styles.roleRailItemActive,
                    ]}
                  >
                    <Text style={styles.roleRailName}>{role.name}</Text>
                    <Text style={styles.roleRailMeta}>
                      {role.usageCount} members ·{" "}
                      {role.isSystem ? "Built-in" : "Custom"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.roleEditor}>
                <Field label="Role name" value={name} onChangeText={setName} stacked />
                <Field
                  label="Description"
                  value={description}
                  onChangeText={setDescription}
                  stacked
                />
                <Text style={styles.permissionTitle}>Permissions</Text>
                {dashboard.permissionCatalog.map((permission) => {
                  const active = permissions.includes(permission.code);
                  return (
                    <Pressable
                      key={permission.code}
                      accessibilityRole="checkbox"
                      accessibilityLabel={permission.label}
                      accessibilityState={{ checked: active }}
                      onPress={() =>
                        setPermissions((current) =>
                          active
                            ? current.filter((item) => item !== permission.code)
                            : [...current, permission.code],
                        )
                      }
                      style={[
                        styles.permissionChoice,
                        active && styles.permissionChoiceActive,
                      ]}
                    >
                      <Text style={styles.permissionChoiceTitle}>
                        {permission.label}
                      </Text>
                      <Text style={styles.permissionChoiceCopy}>
                        {permission.description}
                      </Text>
                    </Pressable>
                  );
                })}
                <Action
                  label={
                    busy ? "Saving…" : selected ? "Save role" : "Create role"
                  }
                  disabled={busy || !name.trim()}
                  onPress={() => void save()}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={styles.detail}
    >
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 18 },
  state: {
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateText: { color: muted, fontSize: 14 },
  hero: {
    borderRadius: 24,
    backgroundColor: "#eaf6ff",
    borderWidth: 1,
    borderColor: "#d5e8f2",
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  heroCompact: { alignItems: "flex-start", flexWrap: "wrap" },
  brandMark: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: { flex: 1, minWidth: 220, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: ink, fontSize: 22, fontWeight: "900" },
  subtitle: { color: muted, fontSize: 14, lineHeight: 20 },
  verificationCopy: {
    color: green,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  heroActions: { flexDirection: "row", gap: 10 },
  heroActionsCompact: { width: "100%" },
  action: {
    minHeight: 43,
    borderRadius: 13,
    backgroundColor: green,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  actionSmall: { minHeight: 34, paddingHorizontal: 12 },
  actionSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: line,
  },
  actionText: { color: "#ffffff", fontWeight: "900", fontSize: 13 },
  actionSecondaryText: { color: green },
  disabled: { opacity: 0.55 },
  errorBanner: {
    borderRadius: 14,
    backgroundColor: "#fff1f1",
    borderWidth: 1,
    borderColor: "#ffc6ca",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  error: { color: "#a52a36", fontSize: 13, lineHeight: 19 },
  metrics: { flexDirection: "row", gap: 12 },
  metricsCompact: { flexWrap: "wrap" },
  metricCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: line,
    borderRadius: 18,
    padding: 16,
  },
  metricCardCompact: { flexBasis: "46%" },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  metricLabel: { color: muted, fontSize: 12, fontWeight: "800" },
  metricValue: { color: ink, fontSize: 25, fontWeight: "900", marginTop: 2 },
  metricCopy: { color: muted, fontSize: 11, marginTop: 3 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: { color: ink, fontSize: 18, fontWeight: "900" },
  sectionCopy: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  refresh: { flexDirection: "row", gap: 6, alignItems: "center" },
  refreshText: { color: green, fontWeight: "800", fontSize: 12 },
  filters: { gap: 8 },
  filter: {
    borderRadius: 999,
    backgroundColor: "#f0f4f2",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  filterActive: { backgroundColor: green },
  filterText: { color: muted, fontWeight: "800", fontSize: 12 },
  filterTextActive: { color: "#ffffff" },
  memberList: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: line,
    overflow: "hidden",
  },
  memberRow: {
    minHeight: 84,
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2ef",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberRowCompact: { flexWrap: "wrap" },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: mint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: green, fontSize: 17, fontWeight: "900" },
  avatarBadge: { position: "absolute", right: -3, bottom: -2 },
  memberIdentity: { flex: 1, minWidth: 180 },
  nameRow: { flexDirection: "row", gap: 7, alignItems: "center" },
  memberName: { color: ink, fontSize: 15, fontWeight: "900" },
  ownerBadge: {
    color: "#52677a",
    backgroundColor: "#edf2f7",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: "900",
  },
  memberMeta: { color: muted, fontSize: 12, marginTop: 3 },
  memberTagline: {
    color: green,
    fontSize: 11,
    marginTop: 3,
    fontWeight: "700",
  },
  chatMetric: { minWidth: 72, alignItems: "center" },
  chatMetricValue: { color: ink, fontWeight: "900", fontSize: 16 },
  chatMetricLabel: { color: muted, fontSize: 10 },
  status: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 10, fontWeight: "900" },
  empty: { color: muted, textAlign: "center", padding: 24 },
  auditCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: line,
    borderRadius: 20,
    padding: 17,
    gap: 5,
  },
  auditRow: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2ef",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  auditType: {
    color: ink,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  auditDate: { color: muted, fontSize: 11 },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(9,19,15,0.52)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalScroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    width: "100%",
  },
  modalCard: {
    width: "100%",
    maxWidth: 680,
    borderRadius: 23,
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 18,
  },
  modalCardWide: {
    width: "100%",
    maxWidth: 930,
    borderRadius: 23,
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  modalTitle: { color: ink, fontSize: 20, fontWeight: "900" },
  modalCopy: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 560,
  },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { flexGrow: 1, flexBasis: 220, gap: 6 },
  fieldStacked: { flexGrow: 0, flexBasis: "auto" },
  fieldLabel: { color: "#425469", fontSize: 11, fontWeight: "900" },
  input: {
    minHeight: 45,
    borderWidth: 1,
    borderColor: line,
    borderRadius: 12,
    color: ink,
    paddingHorizontal: 13,
    fontSize: 13,
  },
  roleChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChoice: {
    borderRadius: 999,
    backgroundColor: "#f0f4f2",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  roleChoiceActive: { backgroundColor: green },
  roleChoiceText: { color: muted, fontSize: 11, fontWeight: "800" },
  roleChoiceTextActive: { color: "#ffffff" },
  activationBox: {
    backgroundColor: mint,
    borderRadius: 16,
    padding: 15,
    gap: 11,
  },
  credential: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  credentialLabel: { color: muted, fontSize: 10, fontWeight: "800" },
  credentialValue: {
    color: ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  activationExpiry: { color: muted, fontSize: 11 },
  memberDetailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  memberEditor: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  memberRoleEditor: { flexGrow: 1, flexBasis: 250, gap: 7 },
  detail: {
    flexGrow: 1,
    flexBasis: 130,
    backgroundColor: "#f5f8f6",
    borderRadius: 12,
    padding: 12,
  },
  detailLabel: { color: muted, fontSize: 10, fontWeight: "800" },
  detailValue: { color: ink, fontSize: 14, fontWeight: "900", marginTop: 3 },
  permissionTitle: { color: ink, fontSize: 12, fontWeight: "900" },
  permissionList: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  permissionPill: {
    color: green,
    backgroundColor: mint,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  modalActions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  removalConfirmation: {
    flex: 1,
    minWidth: 240,
    gap: 8,
    borderWidth: 1,
    borderColor: "#f0c9cd",
    backgroundColor: "#fff6f6",
    borderRadius: 14,
    padding: 12,
  },
  removalConfirmationText: {
    color: "#852936",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  removalConfirmationActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ownerNote: { color: muted, fontSize: 12, fontStyle: "italic" },
  supervisorDesk: {
    minHeight: 300,
    maxHeight: 430,
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: line,
    borderRadius: 16,
    overflow: "hidden",
  },
  supervisorConversationList: {
    width: 265,
    minWidth: 220,
    borderRightWidth: 1,
    borderRightColor: line,
  },
  supervisorConversation: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2ef",
  },
  supervisorConversationActive: { backgroundColor: mint },
  supervisorConversationName: { color: ink, fontSize: 12, fontWeight: "900" },
  supervisorConversationCopy: { color: muted, fontSize: 10, marginTop: 3 },
  supervisorConversationMeta: { color: green, fontSize: 9, marginTop: 4 },
  supervisorThread: { flex: 1, minWidth: 280, padding: 13, gap: 8 },
  supervisorThreadTitle: { color: ink, fontSize: 14, fontWeight: "900" },
  supervisorMessages: { flex: 1 },
  supervisorMessage: {
    backgroundColor: "#f5f8f6",
    borderRadius: 11,
    padding: 9,
    marginBottom: 7,
  },
  supervisorSenderRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  supervisorSender: { color: green, fontSize: 9, fontWeight: "900" },
  supervisorTagline: { color: muted, fontSize: 8, marginTop: 1 },
  supervisorBody: { color: ink, fontSize: 11, lineHeight: 16, marginTop: 4 },
  supervisorEmpty: { color: muted, fontSize: 11, lineHeight: 17, padding: 14 },
  reassignRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  reassignLabel: { color: muted, fontSize: 10, fontWeight: "800" },
  reassignButton: { backgroundColor: mint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  reassignButtonText: { color: green, fontSize: 9, fontWeight: "900" },
  roleManager: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  roleRail: { flex: 1, minWidth: 220, gap: 7 },
  roleRailItem: {
    borderWidth: 1,
    borderColor: line,
    borderRadius: 12,
    padding: 12,
  },
  roleRailItemActive: { borderColor: green, backgroundColor: mint },
  roleRailName: { color: ink, fontSize: 13, fontWeight: "900" },
  roleRailMeta: { color: muted, fontSize: 10, marginTop: 3 },
  roleEditor: { flex: 2, minWidth: 270, gap: 10 },
  permissionChoice: {
    borderWidth: 1,
    borderColor: line,
    borderRadius: 12,
    padding: 11,
  },
  permissionChoiceActive: { borderColor: green, backgroundColor: mint },
  permissionChoiceTitle: { color: ink, fontSize: 12, fontWeight: "900" },
  permissionChoiceCopy: { color: muted, fontSize: 10, marginTop: 3 },
});
