import type { User } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";
import { toMinorUnits } from "../financial/utils";

export type CharityOrg = {
  id: string;
  ownerId: string;
  name: string;
  cause: string;
  city: string;
  description: string;
  goalMinor: bigint;
  raisedMinor: bigint;
  isVerified: boolean;
  createdAt: string;
};

export type MissingPersonReport = {
  id: string;
  reporterId: string;
  personName: string;
  ageText: string;
  photoUrl: string;
  lastSeenCity: string;
  lastSeenLocation: string;
  lastSeenDate: string | null;
  description: string;
  status: "missing" | "found";
  createdAt: string;
};

function userIdFor(user: unknown) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!user || typeof user !== "object" || !("id" in user)) {
    throw new Error("Sign in with a real Supabase account first.");
  }
  return (user as User).id;
}

function toMinor(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.round(value));
  if (typeof value === "string") return BigInt(value);
  return 0n;
}

function ensureNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const mapCharity = (row: any): CharityOrg => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  cause: row.cause,
  city: row.city,
  description: row.description ?? "",
  goalMinor: toMinor(row.goal_minor),
  raisedMinor: toMinor(row.raised_minor),
  isVerified: Boolean(row.is_verified),
  createdAt: row.created_at,
});

const mapMissing = (row: any): MissingPersonReport => ({
  id: row.id,
  reporterId: row.reporter_id,
  personName: row.person_name,
  ageText: row.age_text ?? "",
  photoUrl: row.photo_url ?? "",
  lastSeenCity: row.last_seen_city ?? "",
  lastSeenLocation: row.last_seen_location ?? "",
  lastSeenDate: row.last_seen_date,
  description: row.description ?? "",
  status: row.status,
  createdAt: row.created_at,
});

export async function listCharityWorkspace(user: unknown) {
  const userId = userIdFor(user);
  const [orgRes, donationRes] = await Promise.all([
    supabase!.from("charity_organizations").select("*").order("created_at", { ascending: false }),
    supabase!
      .from("charity_donation_intents")
      .select("organization_id,amount_minor,status,donor_id")
      .eq("donor_id", userId),
  ]);
  ensureNoError(orgRes.error);
  ensureNoError(donationRes.error);
  const confirmed = (donationRes.data ?? []).filter((row: any) => row.status === "confirmed");
  return {
    organizations: (orgRes.data ?? []).map(mapCharity),
    impactMinor: confirmed.reduce((total: bigint, row: any) => total + toMinor(row.amount_minor), 0n),
    helpedCount: new Set(confirmed.map((row: any) => row.organization_id)).size,
  };
}

export async function registerCharity(user: unknown, input: {
  name: string;
  cause: string;
  city: string;
  description: string;
  goalInput: string;
}) {
  const userId = userIdFor(user);
  if (!input.name.trim()) throw new Error("Organisation name is required.");
  const { data, error } = await supabase!
    .from("charity_organizations")
    .insert({
      owner_id: userId,
      name: input.name.trim(),
      cause: input.cause.trim() || "General",
      city: input.city.trim(),
      description: input.description.trim(),
      goal_minor: toMinorUnits(input.goalInput || "0").toString(),
    })
    .select("*")
    .single();
  ensureNoError(error);
  return mapCharity(data);
}

export async function pledgeDonation(user: unknown, organizationId: string, amountInput: string) {
  const userId = userIdFor(user);
  const amountMinor = toMinorUnits(amountInput);
  if (amountMinor <= 0n) throw new Error("Donation pledge amount must be greater than ₹0.");
  const { error } = await supabase!.from("charity_donation_intents").insert({
    organization_id: organizationId,
    donor_id: userId,
    amount_minor: amountMinor.toString(),
    status: "pending",
  });
  ensureNoError(error);
}

export async function volunteerForCharity(user: unknown, organizationId: string) {
  const userId = userIdFor(user);
  const { error } = await supabase!.from("charity_volunteer_interests").upsert(
    {
      organization_id: organizationId,
      volunteer_id: userId,
      status: "interested",
    },
    { onConflict: "organization_id,volunteer_id" },
  );
  ensureNoError(error);
}

export async function listMissingReports(user: unknown) {
  userIdFor(user);
  const { data, error } = await supabase!
    .from("missing_person_reports")
    .select("*")
    .order("created_at", { ascending: false });
  ensureNoError(error);
  return (data ?? []).map(mapMissing);
}

export async function createMissingReport(user: unknown, input: {
  personName: string;
  ageText: string;
  lastSeenCity: string;
  lastSeenLocation: string;
  lastSeenDate: string;
  description: string;
  reporterContact: string;
  status: "missing" | "found";
}) {
  const userId = userIdFor(user);
  if (!input.personName.trim()) throw new Error("Person name is required.");
  if (!input.reporterContact.trim()) throw new Error("Reporter contact is required.");
  const { data, error } = await supabase!
    .from("missing_person_reports")
    .insert({
      reporter_id: userId,
      person_name: input.personName.trim(),
      age_text: input.ageText.trim(),
      last_seen_city: input.lastSeenCity.trim(),
      last_seen_location: input.lastSeenLocation.trim(),
      last_seen_date: input.lastSeenDate.trim() || null,
      description: input.description.trim(),
      reporter_contact: input.reporterContact.trim(),
      status: input.status,
      consent_confirmed: true,
    })
    .select("*")
    .single();
  ensureNoError(error);
  return mapMissing(data);
}

export async function updateMissingStatus(user: unknown, reportId: string, status: "missing" | "found") {
  userIdFor(user);
  const { error } = await supabase!
    .from("missing_person_reports")
    .update({ status })
    .eq("id", reportId);
  ensureNoError(error);
}
