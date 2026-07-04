"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminCategoriesPage() {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("");
  const [sortOrder, setSortOrder] = useState("0");

  const { data } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const res = await fetch("/api/admin/categories", { credentials: "include" });
      if (!res.ok) throw new Error("categories");
      return res.json() as Promise<{
        categories: Array<{ id: string; key: string; label: string; icon: string | null; sort_order: number }>;
      }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: key.trim(),
          label: label.trim(),
          icon: icon.trim() || null,
          sort_order: Number(sortOrder) || 0,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: { message?: string } }).error?.message ?? "Failed to create category");
      }
    },
    onSuccess: () => {
      toast.success("Category created");
      setKey("");
      setLabel("");
      setIcon("");
      setSortOrder("0");
      void qc.invalidateQueries({ queryKey: ["admin-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">Categories</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add category</CardTitle>
          <CardDescription>Used on search chips and listing taxonomy.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="cat-key">Key</Label>
              <Input id="cat-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="beachfront" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-label">Label</Label>
              <Input id="cat-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Beachfront" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-icon">Icon</Label>
              <Input id="cat-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="palm-tree" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-sort">Sort order</Label>
              <Input id="cat-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <div className="md:col-span-4">
              <Button type="submit" disabled={createMutation.isPending}>
                Create category
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current categories</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Icon</TableHead>
                <TableHead>Sort</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.categories ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.key}</TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>{row.icon ?? "-"}</TableCell>
                  <TableCell>{row.sort_order}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
