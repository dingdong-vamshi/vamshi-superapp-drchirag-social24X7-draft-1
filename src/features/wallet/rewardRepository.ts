import type { SupabaseClient } from "@supabase/supabase-js";

export type RewardSnapshot = {
  confirmedBalanceMicrounits: number;
  pendingMicrounits: number;
  todayMicrounits: number;
  activeSessionId?: string | null;
  startedAt?: string | null;
  endsAt?: string | null;
  rateMicrounitsPerHour: number;
  serverNow: string;
};

export type RewardNetwork = {
  totalReferred: number;
  activeReferred: number;
  bonusBps: number;
  referralCode: string;
};

export type WalletContact = {
  id: string;
  name: string;
  username: string;
};

export type RewardHistoryItem = {
  id: string;
  amountMicrounits: number;
  description: string;
  createdAt: string;
};

export type RewardRepository = {
  available: boolean;
  getSnapshot(): Promise<RewardSnapshot>;
  startSession(): Promise<RewardSnapshot>;
  getHistory(): Promise<RewardHistoryItem[]>;
  getLifetimeMinedMicrounits(): Promise<number>;
  getNetwork(): Promise<RewardNetwork>;
  getContacts(): Promise<WalletContact[]>;
  getReceiveCode(): Promise<string>;
  openChat(contactId: string): Promise<string>;
  transferCoins(input: { recipientId: string; amountMicrounits: number; note?: string; idempotencyKey?: string }): Promise<void>;
};

const unavailable = (): never => {
  throw new Error("Sign in with a Supabase account to use Social24 Coins.");
};

export const unavailableRewardRepository: RewardRepository = {
  available: false,
  async getSnapshot() { return unavailable(); },
  async startSession() { return unavailable(); },
  async getHistory() { return unavailable(); },
  async getLifetimeMinedMicrounits() { return unavailable(); },
  async getNetwork() { return unavailable(); },
  async getContacts() { return unavailable(); },
  async getReceiveCode() { return unavailable(); },
  async openChat() { return unavailable(); },
  async transferCoins() { return unavailable(); },
};

const asNumber = (value: unknown) => Number(value || 0);

export const coinInputToMicrounits = (value: string) => {
  const clean = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  const amount = Number(whole) * 1_000_000 + Number((fraction + "000000").slice(0, 6));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};

export const readWalletRecipient = (raw: string) => {
  try {
    const parsed = new URL(raw);
    const id = parsed.searchParams.get("user");
    const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "");
    return parsed.protocol === "social24:" && parsed.hostname === "wallet" && parsed.pathname === "/receive" && validId ? id : null;
  } catch {
    return null;
  }
};

// Native runtimes do not all expose crypto.randomUUID. The idempotency key is
// still generated client-side only to make a repeated submit retry-safe; the
// database remains the authority for the transfer itself.
export const createTransferIdempotencyKey = () => {
  const nativeUuid = globalThis.crypto?.randomUUID?.();
  if (nativeUuid) return nativeUuid;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export function createSupabaseRewardRepository(client: SupabaseClient): RewardRepository {
  const getSnapshot = async () => {
    const { data, error } = await client.rpc("get_my_reward_snapshot");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Reward account is unavailable.");
    return {
      confirmedBalanceMicrounits: asNumber(row.confirmed_balance_microunits),
      pendingMicrounits: asNumber(row.pending_microunits),
      todayMicrounits: asNumber(row.today_microunits),
      activeSessionId: row.active_session_id,
      startedAt: row.started_at,
      endsAt: row.ends_at,
      rateMicrounitsPerHour: asNumber(row.rate_microunits_per_hour),
      serverNow: row.server_now,
    } satisfies RewardSnapshot;
  };
  return {
    available: true,
    getSnapshot,
    async startSession() {
      const { error } = await client.rpc("start_reward_session");
      if (error) throw new Error(error.message);
      return getSnapshot();
    },
    async getHistory() {
      const { data, error } = await client.rpc("get_my_reward_history", { result_limit: 30 });
      if (error) throw new Error(error.message);
      return (data || []).map((row: any) => ({
        id: row.id,
        amountMicrounits: asNumber(row.amount_microunits),
        description: row.description,
        createdAt: row.created_at,
      }));
    },
    async getLifetimeMinedMicrounits() {
      const { data, error } = await client.rpc("get_my_lifetime_mined_coins");
      if (error) throw new Error(error.message);
      return asNumber(data);
    },
    async getNetwork() {
      const { data, error } = await client.rpc("get_my_reward_referral_network");
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return {
        totalReferred: asNumber(row?.total_referred),
        activeReferred: asNumber(row?.active_referred),
        bonusBps: asNumber(row?.bonus_bps),
        referralCode: typeof row?.referral_code === "string" ? row.referral_code : "",
      } satisfies RewardNetwork;
    },
    async getContacts() {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw new Error("Sign in to send Social24 Coins.");
      const viewerId = auth.user.id;
      const { data: requests, error: requestError } = await client
        .from("connection_requests")
        .select("requester_id,recipient_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`);
      if (requestError) throw new Error(requestError.message);
      const ids = ((requests as Array<{ requester_id: string; recipient_id: string }> | null) ?? [])
        .map((request) => request.requester_id === viewerId ? request.recipient_id : request.requester_id);
      if (!ids.length) return [];
      const { data: profiles, error: profileError } = await client
        .from("profiles")
        .select("id,username,display_name")
        .in("id", ids);
      if (profileError) throw new Error(profileError.message);
      return ((profiles as Array<{ id: string; username: string | null; display_name: string | null }> | null) ?? [])
        .map((profile) => ({
          id: profile.id,
          name: profile.display_name || profile.username || "Social24 friend",
          username: profile.username || profile.id.slice(0, 8),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    async getReceiveCode() {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new Error("Sign in to receive Social24 Coins.");
      return `social24://wallet/receive?user=${encodeURIComponent(data.user.id)}`;
    },
    async openChat(contactId) {
      const { data, error } = await client.rpc("open_personal_conversation", { participant: contactId });
      if (error) throw new Error(error.message);
      if (typeof data !== "string" || !data) throw new Error("This friend chat could not be opened.");
      return data;
    },
    async transferCoins(input) {
      if (!Number.isSafeInteger(input.amountMicrounits) || input.amountMicrounits <= 0) {
        throw new Error("Enter a positive coin amount.");
      }
      const { error } = await client.rpc("transfer_reward_coins", {
        p_recipient_id: input.recipientId,
        p_amount_microunits: input.amountMicrounits,
        p_note: input.note?.trim() || null,
        p_idempotency_key: input.idempotencyKey || createTransferIdempotencyKey(),
      });
      if (error) throw new Error(error.message);
    },
  };
}

export const formatCoins = (microunits: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    .format(microunits / 1_000_000);
