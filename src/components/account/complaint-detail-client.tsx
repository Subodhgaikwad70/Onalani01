"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseSession } from "@/lib/supabase/session-context";

type ComplaintMessage = {
  id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  author?: { display_name?: string | null } | null;
};

type ComplaintDetail = {
  id: string;
  title: string;
  body: string;
  status: string;
  category: string;
  subject_type: string;
  subject_id?: string | null;
  resolution_summary?: string | null;
  created_at: string;
  complaint_messages?: ComplaintMessage[];
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ComplaintDetailClient({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { user } = useSupabaseSession();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["complaint", id],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("complaint");
      return res.json() as Promise<{ complaint: ComplaintDetail }>;
    },
  });

  const complaint = data?.complaint ?? null;
  const messages = [...(complaint?.complaint_messages ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  async function sendReply() {
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/complaints/${encodeURIComponent(id)}/messages`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error?.message ?? "Could not send reply");
        return;
      }
      setReply("");
      toast.success("Reply sent");
      void queryClient.invalidateQueries({ queryKey: ["complaint", id] });
    } finally {
      setSending(false);
    }
  }

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading complaint...</p>;
  }

  if (!complaint) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/account/complaints">Back</Link>
        </Button>
        <p className="text-sm text-muted-foreground">Complaint not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/account/complaints">Back</Link>
      </Button>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{complaint.title}</CardTitle>
              <CardDescription>
                Submitted {formatDate(complaint.created_at)}
              </CardDescription>
            </div>
            <Badge variant="outline">{complaint.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Category
              </p>
              <p className="mt-1 capitalize">{complaint.category}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Subject
              </p>
              <p className="mt-1 capitalize">
                {complaint.subject_type}
                {complaint.subject_id ? ` - ${complaint.subject_id}` : ""}
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Complaint details
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {complaint.body}
            </p>
          </div>

          {complaint.resolution_summary ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-medium uppercase text-emerald-900">
                Host / support response
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-emerald-950">
                {complaint.resolution_summary}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Replies</CardTitle>
          <CardDescription>
            Messages from you and the Onalani team about this complaint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.length > 0 ? (
            <div className="space-y-3">
              {messages.map((message) => {
                const mine = message.author_id === user?.id;
                return (
                  <div
                    key={message.id}
                    className="rounded-xl border bg-white p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {mine
                          ? "You"
                          : message.author?.display_name || "Onalani team"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(message.created_at)}
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                      {message.body}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No replies yet. The team response will appear here.
            </p>
          )}

          <div className="space-y-2">
            <Textarea
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Add more information or reply to the team..."
            />
            <Button type="button" disabled={sending} onClick={() => void sendReply()}>
              {sending ? "Sending..." : "Send reply"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
