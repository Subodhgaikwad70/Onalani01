"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminTaxRatesPage() {
  const qc = useQueryClient();
  const [jurisdiction, setJurisdiction] = useState("");
  const [kind, setKind] = useState<
    "occupancy" | "vat" | "city" | "state" | "federal" | "service"
  >("occupancy");
  const [appliesTo, setAppliesTo] = useState<"subtotal" | "nightly" | "fees" | "total">(
    "subtotal",
  );
  const [ratePct, setRatePct] = useState("10");

  const { data } = useQuery({
    queryKey: ["admin-tax-rates"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tax-rates", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("tax-rates");
      return res.json() as Promise<{
        tax_rates: Array<{
          id: string;
          jurisdiction: string;
          kind: string;
          rate_pct: number;
          applies_to: string;
          is_active: boolean;
        }>;
      }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/tax-rates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdiction: jurisdiction.trim(),
          kind,
          rate_pct: Number(ratePct),
          applies_to: appliesTo,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: { message?: string } }).error?.message ?? "Failed to create tax rate");
      }
    },
    onSuccess: () => {
      toast.success("Tax rate created");
      setJurisdiction("");
      setRatePct("10");
      setKind("occupancy");
      setAppliesTo("subtotal");
      void qc.invalidateQueries({ queryKey: ["admin-tax-rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">Tax rates</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add tax rate</CardTitle>
          <CardDescription>Applied via property tax-rate mappings in pricing quote.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4" onSubmit={onSubmit}>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tax-jurisdiction">Jurisdiction</Label>
              <Input
                id="tax-jurisdiction"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="Hawaii occupancy tax"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-kind">Kind</Label>
              <select
                id="tax-kind"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={kind}
                onChange={(e) =>
                  setKind(
                    e.target.value as
                      | "occupancy"
                      | "vat"
                      | "city"
                      | "state"
                      | "federal"
                      | "service",
                  )
                }
              >
                <option value="occupancy">occupancy</option>
                <option value="vat">vat</option>
                <option value="city">city</option>
                <option value="state">state</option>
                <option value="federal">federal</option>
                <option value="service">service</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-rate">Rate %</Label>
              <Input
                id="tax-rate"
                type="number"
                step="0.001"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-applies">Applies to</Label>
              <select
                id="tax-applies"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={appliesTo}
                onChange={(e) =>
                  setAppliesTo(e.target.value as "subtotal" | "nightly" | "fees" | "total")
                }
              >
                <option value="subtotal">subtotal</option>
                <option value="nightly">nightly</option>
                <option value="fees">fees</option>
                <option value="total">total</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <Button type="submit" disabled={createMutation.isPending}>
                Create tax rate
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current tax rates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.tax_rates ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.jurisdiction}</TableCell>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell>{row.rate_pct}%</TableCell>
                  <TableCell>{row.applies_to}</TableCell>
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
