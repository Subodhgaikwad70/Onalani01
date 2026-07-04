"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ComplaintDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("open");
  const [summary, setSummary] = useState("");
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  async function loadComplaint() {
    await fetch(`/api/admin/complaints/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        const c = j.complaint as Record<string, unknown>;
        setRow(c);
        setStatus((c.status as string) ?? "open");
        setSummary((c.resolution_summary as string) ?? "");
      })
      .catch(() => toast.error("Could not load complaint"));
  }

  useEffect(() => {
    void loadComplaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load current id once per route param.
  }, [id]);

  async function save() {
    const res = await fetch(`/api/admin/complaints/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        resolution_summary: summary || null,
      }),
    });
    if (!res.ok) {
      toast.error("Update failed");
      return;
    }
    toast.success("Saved");
    router.refresh();
  }

  async function sendReply() {
    const body = reply.trim();
    if (!body) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/complaints/${id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        toast.error("Could not send reply");
        return;
      }
      setReply("");
      toast.success("Reply sent");
      await loadComplaint();
    } finally {
      setSendingReply(false);
    }
  }

  const messages = Array.isArray(row?.complaint_messages)
    ? ([...(row.complaint_messages as Array<Record<string, unknown>>)].sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)),
      ))
    : [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/admin/complaints">← Back</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{(row?.title as string) ?? "Complaint"}</CardTitle>
          <CardDescription className="font-mono text-xs">{id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Category
              </p>
              <p className="mt-1 capitalize">{(row?.category as string) ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Subject
              </p>
              <p className="mt-1 capitalize">
                {(row?.subject_type as string) ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Submitted
              </p>
              <p className="mt-1">
                {row?.created_at
                  ? new Date(row.created_at as string).toLocaleString()
                  : "-"}
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Complaint details
            </p>
            <p className="mt-2 whitespace-pre-wrap">
              {(row?.body as string) ?? "No details provided."}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Resolution summary</label>
            <Textarea
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <Button type="button" onClick={save}>
            Save changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visible replies</CardTitle>
          <CardDescription>
            These messages are visible to the guest on their complaint detail page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.length > 0 ? (
            <div className="space-y-3">
              {messages.map((message) => {
                const author = message.author as
                  | { display_name?: string | null }
                  | null
                  | undefined;
                return (
                  <div key={message.id as string} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {author?.display_name || "Team member"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {message.created_at
                          ? new Date(message.created_at as string).toLocaleString()
                          : ""}
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {message.body as string}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No replies yet.</p>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Reply to guest</label>
            <Textarea
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a visible reply..."
            />
            <Button
              type="button"
              disabled={sendingReply}
              onClick={() => void sendReply()}
            >
              {sendingReply ? "Sending..." : "Send reply"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
