"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminComplaintsPage() {
  const { data } = useQuery({
    queryKey: ["admin-complaints"],
    queryFn: async () => {
      const res = await fetch("/api/admin/complaints", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("complaints");
      return res.json() as Promise<{
        complaints: Array<{ id: string; title: string; status: string }>;
      }>;
    },
  });

  const rows = data?.complaints ?? [];

  return (
    <div className="space-y-6">
      <h1 className="font-[family-name:var(--font-lora)] text-2xl font-semibold">
        Complaints
      </h1>
      <div className="grid gap-3">
        {rows.map((c) => (
          <Link key={c.id} href={`/admin/complaints/${c.id}`}>
            <Card className="transition hover:border-primary/40">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <p className="font-medium">{c.title}</p>
                <Badge variant="outline">{c.status}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
