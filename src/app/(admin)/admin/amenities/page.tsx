"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminAmenitiesPage() {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("");
  const [category, setCategory] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-amenities"],
    queryFn: async () => {
      const res = await fetch("/api/admin/amenities", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("amenities");
      return res.json() as Promise<{
        amenities: Array<{ id: string; key: string; label: string; icon: string | null; category: string | null }>;
      }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/amenities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: key.trim(),
          label: label.trim(),
          icon: icon.trim() || null,
          category: category.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: { message?: string } }).error?.message ?? "Failed to create amenity");
      }
    },
    onSuccess: () => {
      toast.success("Amenity created");
      setKey("");
      setLabel("");
      setIcon("");
      setCategory("");
      void qc.invalidateQueries({ queryKey: ["admin-amenities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-(family-name:--font-lora) text-2xl font-semibold">Amenities</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add amenity</CardTitle>
          <CardDescription>Key should be lowercase with underscores.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="amenity-key">Key</Label>
              <Input id="amenity-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="wifi" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amenity-label">Label</Label>
              <Input id="amenity-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Wi-Fi" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amenity-icon">Icon</Label>
              <Input id="amenity-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="wifi" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amenity-category">Category</Label>
              <Input
                id="amenity-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="essentials"
              />
            </div>
            <div className="md:col-span-4">
              <Button type="submit" disabled={createMutation.isPending}>
                Create amenity
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current amenities</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Icon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.amenities ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.key}</TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>{row.category ?? "-"}</TableCell>
                  <TableCell>{row.icon ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
