"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminPromosPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("10");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [perUserLimit, setPerUserLimit] = useState("1");
  const [minSubtotalCents, setMinSubtotalCents] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-promos"],
    queryFn: async () => {
      const res = await fetch("/api/admin/promos", { credentials: "include" });
      if (!res.ok) throw new Error("promos");
      return res.json() as Promise<{
        promos: Array<{
          id: string;
          code: string;
          kind: "percent" | "fixed";
          value: number;
          is_active: boolean;
          redemption_count: number;
          max_redemptions: number | null;
        }>;
      }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/promos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          kind,
          value: Number(value),
          max_redemptions: maxRedemptions.trim() ? Number(maxRedemptions) : null,
          per_user_limit: Number(perUserLimit) || 1,
          min_subtotal_cents: minSubtotalCents.trim()
            ? Number(minSubtotalCents)
            : null,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: { message?: string } }).error?.message ?? "Failed to create promo");
      }
    },
    onSuccess: () => {
      toast.success("Promo created");
      setCode("");
      setKind("percent");
      setValue("10");
      setMaxRedemptions("");
      setPerUserLimit("1");
      setMinSubtotalCents("");
      void qc.invalidateQueries({ queryKey: ["admin-promos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">Promo codes</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create promo</CardTitle>
          <CardDescription>Supports percentage or fixed-amount discounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="promo-code">Code</Label>
              <Input id="promo-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="DEMO10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo-kind">Kind</Label>
              <select
                id="promo-kind"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as "percent" | "fixed")}
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo-value">Value</Label>
              <Input id="promo-value" type="number" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo-max-redemptions">Max redemptions</Label>
              <Input
                id="promo-max-redemptions"
                type="number"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo-per-user">Per-user limit</Label>
              <Input
                id="promo-per-user"
                type="number"
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promo-min-subtotal">Min subtotal (cents)</Label>
              <Input
                id="promo-min-subtotal"
                type="number"
                value={minSubtotalCents}
                onChange={(e) => setMinSubtotalCents(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={createMutation.isPending}>
                Create promo
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current promos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Redeemed</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.promos ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell>{row.value}</TableCell>
                  <TableCell>
                    {row.redemption_count}
                    {row.max_redemptions ? ` / ${row.max_redemptions}` : ""}
                  </TableCell>
                  <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
