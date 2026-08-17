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
};

const unavailable = (): never => {
  throw new Error("Sign in with a Supabase account to use Social24 Coins.");
};

export const unavailableRewardRepository: RewardRepository = {
  available: false,
  async getSnapshot() { return unavailable(); },
  async startSession() { return unavailable(); },
  async getHistory() { return unavailable(); },
};

const asNumber = (value: unknown) => Number(value || 0);

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
  };
}

export const formatCoins = (microunits: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    .format(Math.max(0, microunits) / 1_000_000);
