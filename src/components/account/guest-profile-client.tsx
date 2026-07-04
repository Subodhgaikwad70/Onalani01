"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  Coins,
  Flag,
  Heart,
  Loader2,
  Mail,
  MessageCircle,
  Shield,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { AccountBreadcrumb } from "@/components/account/account-breadcrumb";
import {
  AccountPageShell,
  AccountSectionLabel,
} from "@/components/account/account-page-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSupabaseSession } from "@/lib/supabase/session-context";
import { cn } from "@/lib/utils";

export type GuestProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  email_verified_at: string | null;
  preferred_currency: string;
  preferred_language: string;
  timezone: string | null;
  country_code: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileForm = {
  displayName: string;
  bio: string;
  phone: string;
  timezone: string;
  countryCode: string;
  preferredCurrency: string;
  preferredLanguage: string;
};

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "ja", label: "日本語" },
] as const;

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Pacific/Honolulu",
  "America/Anchorage",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

const COUNTRY_CODES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "JP", label: "Japan" },
] as const;

const QUICK_LINKS = [
  { href: "/account/trips", label: "Trips", icon: BedDouble },
  { href: "/account/messages", label: "Messages", icon: MessageCircle },
  { href: "/account/credits", label: "Credits", icon: Coins },
  { href: "/account/wishlists", label: "Wishlists", icon: Heart },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/complaints", label: "Help & complaints", icon: Flag },
] as const;

function profileInitials(name: string, email: string | null): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email?.[0] ?? "G").toUpperCase();
}

function profileToForm(profile: GuestProfile): ProfileForm {
  return {
    displayName: profile.display_name ?? "",
    bio: profile.bio ?? "",
    phone: profile.phone ?? "",
    timezone: profile.timezone ?? "",
    countryCode: profile.country_code ?? "",
    preferredCurrency: (profile.preferred_currency ?? "USD").toUpperCase(),
    preferredLanguage: (profile.preferred_language ?? "en").toLowerCase(),
  };
}

async function fetchGuestProfile(): Promise<{
  profile: GuestProfile | null;
  email: string | null;
}> {
  const res = await fetch("/api/guests/me", { credentials: "include" });
  if (!res.ok) throw new Error("profile");
  return res.json() as Promise<{ profile: GuestProfile | null; email: string | null }>;
}

async function uploadAvatar(userId: string, file: File): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/profile/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("property-photos")
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
  if (error) throw error;

  const { data } = supabase.storage.from("property-photos").getPublicUrl(path);
  return data.publicUrl;
}

function ProfileField({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-[#374151]">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-[#9ca3af]">{hint}</p> : null}
    </div>
  );
}

function ProfileCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[#e2e8e4] bg-white p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-[#1f2937]">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[#6b7280]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function GuestProfileClient() {
  const { user } = useSupabaseSession();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ProfileForm | null>(null);
  const [referralEmail, setReferralEmail] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [passwordResetSending, setPasswordResetSending] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["guest-profile", user?.id],
    queryFn: fetchGuestProfile,
    enabled: Boolean(user?.id),
  });

  const referralsQuery = useQuery({
    queryKey: ["guest-referrals", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/guests/me/referrals", { credentials: "include" });
      if (!res.ok) throw new Error("referrals");
      const j = (await res.json()) as {
        referrals: { id: string; referred_email: string; created_at: string }[];
      };
      return j.referrals ?? [];
    },
    enabled: Boolean(user?.id),
  });

  const profile = profileQuery.data?.profile ?? null;
  const email = profileQuery.data?.email ?? user?.email ?? null;

  const form = draft ?? (profile ? profileToForm(profile) : null);

  const isDirty = useMemo(() => {
    if (!profile || !form) return false;
    return JSON.stringify(form) !== JSON.stringify(profileToForm(profile));
  }, [profile, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: ProfileForm) => {
      const res = await fetch("/api/guests/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: values.displayName.trim(),
          bio: values.bio.trim() || null,
          phone: values.phone.trim() || null,
          timezone: values.timezone.trim() || null,
          country_code: values.countryCode.trim() || null,
          preferred_currency: values.preferredCurrency,
          preferred_language: values.preferredLanguage,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: { message?: string } }).error?.message ??
            "Could not save profile",
        );
      }
      return res.json() as Promise<{ profile: GuestProfile }>;
    },
    onSuccess: (data) => {
      toast.success("Profile saved");
      setDraft(null);
      queryClient.setQueryData(["guest-profile", user?.id], {
        profile: data.profile,
        email,
      });
      void queryClient.invalidateQueries({ queryKey: ["account-profile-snippet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const referralMutation = useMutation({
    mutationFn: async (inviteEmail: string) => {
      const res = await fetch("/api/guests/me/referrals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: { message?: string } }).error?.message ??
            "Could not send invite",
        );
      }
    },
    onSuccess: () => {
      toast.success("Invite sent");
      setReferralEmail("");
      void queryClient.invalidateQueries({ queryKey: ["guest-referrals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateDraft(patch: Partial<ProfileForm>) {
    setDraft((prev) => ({
      ...(prev ?? (profile ? profileToForm(profile) : {
        displayName: "",
        bio: "",
        phone: "",
        timezone: "",
        countryCode: "",
        preferredCurrency: "USD",
        preferredLanguage: "en",
      })),
      ...patch,
    }));
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller");
      return;
    }

    setAvatarUploading(true);
    try {
      const url = await uploadAvatar(user.id, file);
      const res = await fetch("/api/guests/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: url }),
      });
      if (!res.ok) throw new Error("Could not update photo");
      const j = (await res.json()) as { profile: GuestProfile };
      queryClient.setQueryData(["guest-profile", user.id], {
        profile: j.profile,
        email,
      });
      void queryClient.invalidateQueries({ queryKey: ["account-profile-snippet"] });
      toast.success("Profile photo updated");
    } catch {
      toast.error("Could not upload photo");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function removeAvatar() {
    if (!user?.id) return;
    setAvatarUploading(true);
    try {
      const res = await fetch("/api/guests/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: null }),
      });
      if (!res.ok) throw new Error("Could not remove photo");
      const j = (await res.json()) as { profile: GuestProfile };
      queryClient.setQueryData(["guest-profile", user.id], {
        profile: j.profile,
        email,
      });
      toast.success("Profile photo removed");
    } catch {
      toast.error("Could not remove photo");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function sendPasswordReset() {
    if (!email) return;
    setPasswordResetSending(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Could not send reset email");
      toast.success("Check your email for a password reset link");
    } catch {
      toast.error("Could not send reset email");
    } finally {
      setPasswordResetSending(false);
    }
  }

  function useBrowserTimezone() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) updateDraft({ timezone: tz });
    } catch {
      toast.error("Could not detect timezone");
    }
  }

  if (profileQuery.isPending || !form) {
    return (
      <AccountPageShell title="Profile" description="Loading your account…">
        <div className="space-y-4 animate-pulse">
          <div className="h-40 rounded-2xl bg-muted/60" />
          <div className="h-64 rounded-xl bg-muted/60" />
          <div className="h-48 rounded-xl bg-muted/60" />
        </div>
      </AccountPageShell>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <AccountPageShell title="Profile">
        <div className="rounded-xl border border-dashed border-[#cfd8d3] bg-[#fafcfb] px-6 py-12 text-center">
          <p className="text-sm text-[#5f6b66]">
            We couldn&apos;t load your profile.{" "}
            <button
              type="button"
              className="font-semibold text-[#1d6fb8] hover:underline"
              onClick={() => void profileQuery.refetch()}
            >
              Try again
            </button>
          </p>
        </div>
      </AccountPageShell>
    );
  }

  const emailVerified = Boolean(profile.email_verified_at);

  return (
    <AccountPageShell
      breadcrumb={
        <AccountBreadcrumb
          items={[
            { label: "Account", href: "/account" },
            { label: "Profile" },
          ]}
        />
      }
      title="Profile"
      description="Manage how you appear to hosts, your travel preferences, and account security."
    >
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-[#dce5e0] bg-gradient-to-br from-[#e8f4fb] via-white to-[#fafcfb] p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              <Avatar className="h-24 w-24 border-2 border-white shadow-md">
                <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="bg-[#1e6a82] text-2xl font-semibold text-white">
                  {profileInitials(form.displayName, email)}
                </AvatarFallback>
              </Avatar>
              {avatarUploading ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                  <Loader2 className="h-7 w-7 animate-spin text-white" />
                </span>
              ) : null}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Upload profile photo"
                onChange={(e) => void handleAvatarSelect(e)}
              />
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-(family-name:--font-lora) text-2xl font-semibold text-[#1e6a82]">
                  {form.displayName.trim() || "Guest"}
                </h2>
                {emailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verified
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-[#6b7280]">{email ?? "—"}</p>
              <p className="text-xs text-[#9ca3af]">
                Member since{" "}
                {formatDate(profile.created_at, "en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-[#dce5e0] bg-white"
                  disabled={avatarUploading}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Change photo
                </Button>
                {profile.avatar_url ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-[#6b7280]"
                    disabled={avatarUploading}
                    onClick={() => void removeAvatar()}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div className="space-y-6">
            <ProfileCard
              title="About you"
              description="Hosts see this when you message them or book a stay."
            >
              <div className="space-y-5">
                <ProfileField label="Display name" htmlFor="display-name">
                  <Input
                    id="display-name"
                    value={form.displayName}
                    onChange={(e) => updateDraft({ displayName: e.target.value })}
                    placeholder="How hosts should address you"
                    className="border-[#dce5e0] bg-[#fafcfb]"
                  />
                </ProfileField>

                <ProfileField
                  label="Bio"
                  htmlFor="bio"
                  hint="Optional — a short note about yourself or travel style."
                >
                  <Textarea
                    id="bio"
                    value={form.bio}
                    onChange={(e) => updateDraft({ bio: e.target.value })}
                    rows={4}
                    placeholder="Weekend explorer, early check-in when possible…"
                    className="border-[#dce5e0] bg-[#fafcfb] resize-none"
                  />
                </ProfileField>

                <div className="grid gap-5 sm:grid-cols-2">
                  <ProfileField label="Phone" htmlFor="phone" hint="For urgent booking updates.">
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => updateDraft({ phone: e.target.value })}
                      placeholder="+1 555 000 0000"
                      className="border-[#dce5e0] bg-[#fafcfb]"
                    />
                  </ProfileField>

                  <ProfileField label="Country" htmlFor="country">
                    <Select
                      value={form.countryCode || "none"}
                      onValueChange={(v) =>
                        updateDraft({ countryCode: v === "none" ? "" : v })
                      }
                    >
                      <SelectTrigger id="country" className="border-[#dce5e0] bg-[#fafcfb]">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        {COUNTRY_CODES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </ProfileField>
                </div>
              </div>
            </ProfileCard>

            <ProfileCard
              title="Travel preferences"
              description="Defaults for search, pricing display, and communications."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <ProfileField label="Preferred currency">
                  <Select
                    value={form.preferredCurrency}
                    onValueChange={(v) => updateDraft({ preferredCurrency: v })}
                  >
                    <SelectTrigger className="border-[#dce5e0] bg-[#fafcfb]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ProfileField>

                <ProfileField label="Language">
                  <Select
                    value={form.preferredLanguage}
                    onValueChange={(v) => updateDraft({ preferredLanguage: v })}
                  >
                    <SelectTrigger className="border-[#dce5e0] bg-[#fafcfb]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ProfileField>

                <ProfileField label="Timezone" htmlFor="timezone">
                  <div className="flex gap-2">
                    <Select
                      value={form.timezone || "none"}
                      onValueChange={(v) =>
                        updateDraft({ timezone: v === "none" ? "" : v })
                      }
                    >
                      <SelectTrigger id="timezone" className="border-[#dce5e0] bg-[#fafcfb]">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 border-[#dce5e0]"
                      onClick={useBrowserTimezone}
                    >
                      Auto
                    </Button>
                  </div>
                </ProfileField>
              </div>
            </ProfileCard>

            <ProfileCard
              title="Invite a friend"
              description="Send a referral invite. When they join and book, you may earn credits."
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  value={referralEmail}
                  onChange={(e) => setReferralEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="border-[#dce5e0] bg-[#fafcfb]"
                />
                <Button
                  type="button"
                  className="shrink-0 bg-[#1e6a82] hover:bg-[#185a6e]"
                  disabled={!referralEmail.trim() || referralMutation.isPending}
                  onClick={() => referralMutation.mutate(referralEmail.trim())}
                >
                  {referralMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send invite"
                  )}
                </Button>
              </div>
              {(referralsQuery.data?.length ?? 0) > 0 ? (
                <ul className="mt-4 space-y-2 border-t border-[#eceeec] pt-4 text-sm text-[#6b7280]">
                  {referralsQuery.data?.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex justify-between gap-3">
                      <span>{r.referred_email}</span>
                      <span className="shrink-0 text-xs text-[#9ca3af]">
                        {formatDate(r.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </ProfileCard>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="rounded-lg bg-[#1e6a82] text-white hover:bg-[#185a6e]"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => form && saveMutation.mutate(form)}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
              {isDirty ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[#6b7280]"
                  onClick={() => setDraft(null)}
                >
                  Discard
                </Button>
              ) : null}
            </div>
          </div>

          <aside className="space-y-6">
            <ProfileCard title="Account security">
              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3 rounded-lg bg-[#fafcfb] p-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#1e6a82]" />
                  <div className="min-w-0">
                    <p className="font-medium text-[#1f2937]">Email</p>
                    <p className="truncate text-[#6b7280]">{email ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-[#fafcfb] p-3">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#1e6a82]" />
                  <div>
                    <p className="font-medium text-[#1f2937]">Password</p>
                    <p className="text-[#6b7280]">
                      We&apos;ll email you a secure link to set a new password.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 border-[#dce5e0]"
                      disabled={!email || passwordResetSending}
                      onClick={() => void sendPasswordReset()}
                    >
                      {passwordResetSending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        "Send reset link"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </ProfileCard>

            <section className="rounded-xl border border-[#e2e8e4] bg-white p-5 shadow-sm">
              <AccountSectionLabel>Quick links</AccountSectionLabel>
              <ul className="mt-4 space-y-1">
                {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center justify-between rounded-lg px-2 py-2.5 text-sm text-[#374151] transition hover:bg-[#fafcfb] hover:text-[#1e6a82]"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-[#9ca3af]" />
                        {label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#cbd5e1]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-[#e2e8e4] bg-[#fafcfb] p-5">
              <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-[#1e6a82]" />
                <div>
                  <p className="text-sm font-medium text-[#1f2937]">
                    Notification settings
                  </p>
                  <p className="mt-1 text-sm text-[#6b7280]">
                    Control booking alerts, messages, and marketing emails.
                  </p>
                  <Link
                    href="/account/notifications"
                    className="mt-3 inline-flex items-center text-sm font-semibold text-[#1d6fb8] hover:underline"
                  >
                    Manage notifications
                    <ChevronRight className="ml-0.5 h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AccountPageShell>
  );
}
