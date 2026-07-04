"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ComplaintsPage() {
  const { data } = useQuery({
    queryKey: ["complaints"],
    queryFn: async () => {
      const res = await fetch("/api/complaints", { credentials: "include" });
      if (!res.ok) throw new Error("complaints");
      return res.json() as Promise<{
        complaints: Array<{
          id: string;
          title: string;
          status: string;
          category: string;
          created_at: string;
        }>;
      }>;
    },
  });

  const rows = data?.complaints ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-lora)] text-2xl font-semibold">
          Complaints
        </h1>
        <Button asChild>
          <Link href="/account/complaints/new">New complaint</Link>
        </Button>
      </div>
      <div className="grid gap-3">
        {rows.map((c) => (
          <Link key={c.id} href={`/account/complaints/${c.id}`}>
            <Card className="transition hover:border-primary/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline">{c.status}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No complaints filed.{" "}
          <Link href="/account/complaints/new" className="text-primary underline">
            Open a case
          </Link>
        </p>
      ) : null}
    </div>
  );
}
