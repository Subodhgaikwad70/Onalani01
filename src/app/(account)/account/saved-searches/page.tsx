"use client";

import Link from "next/link";
import { AccountBreadcrumb } from "@/components/account/account-breadcrumb";
import {
  AccountPageShell,
  AccountSectionLabel,
} from "@/components/account/account-page-shell";
import { SavedSearchesPanel } from "@/components/account/saved-searches-panel";

export default function SavedSearchesPage() {
  return (
    <AccountPageShell
      breadcrumb={
        <AccountBreadcrumb
          items={[
            { label: "Account", href: "/account" },
            { label: "Saved searches" },
          ]}
        />
      }
      title="Saved searches"
      description={
        <>
          Reopen past stays searches with one tap.{" "}
          <Link
            href="/account/notifications"
            className="font-semibold text-[#1d6fb8] hover:underline"
          >
            Also in Notifications
          </Link>
        </>
      }
    >
      <section className="space-y-4">
        <AccountSectionLabel>Your searches</AccountSectionLabel>
        <SavedSearchesPanel />
      </section>
    </AccountPageShell>
  );
}
