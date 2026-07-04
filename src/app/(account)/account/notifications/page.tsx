"use client";

import { useEffect, useState } from "react";
import { AccountBreadcrumb } from "@/components/account/account-breadcrumb";
import {
  AccountPageShell,
  AccountSectionLabel,
} from "@/components/account/account-page-shell";
import { NotificationsInbox } from "@/components/account/notifications-inbox";
import { SavedSearchesPanel } from "@/components/account/saved-searches-panel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState({
    email_marketing: false,
    email_bookings: true,
    email_messages: true,
    email_reminders: true,
    push_messages: false,
    push_bookings: true,
    digest_frequency: "instant" as "instant" | "daily" | "off",
  });

  useEffect(() => {
    void fetch("/api/guests/me/notification-preferences", {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.preferences) {
          setPrefs((p) => ({ ...p, ...j.preferences }));
        }
      })
      .catch(() => {});
  }, []);

  async function savePrefs() {
    const res = await fetch("/api/guests/me/notification-preferences", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    if (!res.ok) {
      toast.error("Could not save preferences");
      return;
    }
    toast.success("Preferences saved");
  }

  return (
    <AccountPageShell
      breadcrumb={
        <AccountBreadcrumb
          items={[
            { label: "Account", href: "/account" },
            { label: "Inbox" },
          ]}
        />
      }
      title="Notifications"
      description="Your inbox, saved searches, and alert preferences."
    >
      <div className="space-y-8">
        <section className="space-y-4">
          <AccountSectionLabel>Inbox</AccountSectionLabel>
          <NotificationsInbox />
        </section>

        <section className="space-y-4">
          <AccountSectionLabel>Saved searches</AccountSectionLabel>
          <SavedSearchesPanel />
        </section>

        <section className="space-y-4">
          <AccountSectionLabel>Preferences</AccountSectionLabel>
          <div
            className={cn(
              "w-full rounded-xl border border-[#e2e8e4] bg-white p-5 shadow-sm",
              "sm:p-6",
            )}
          >
            <div className="space-y-4">
              {(
                [
                  ["email_bookings", "Email · Bookings"],
                  ["email_messages", "Email · Messages"],
                  ["email_reminders", "Email · Reminders"],
                  ["email_marketing", "Email · Marketing"],
                  ["push_bookings", "Push · Bookings"],
                  ["push_messages", "Push · Messages"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4 border-b border-[#eceeec] pb-4 last:border-0 last:pb-0"
                >
                  <Label htmlFor={key} className="text-sm text-[#1f2937]">
                    {label}
                  </Label>
                  <Switch
                    id={key}
                    checked={prefs[key] as boolean}
                    onCheckedChange={(c) =>
                      setPrefs((p) => ({ ...p, [key]: c }))
                    }
                  />
                </div>
              ))}
              <Button
                type="button"
                className="mt-2 rounded-lg bg-[#1e6a82] text-white hover:bg-[#185a6e]"
                onClick={savePrefs}
              >
                Save preferences
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AccountPageShell>
  );
}
