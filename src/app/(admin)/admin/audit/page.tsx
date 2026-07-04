"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  async function load(p: number) {
    const res = await fetch(`/api/admin/audit?page=${p}&limit=40`, {
      credentials: "include",
    });
    const j = await res.json();
    setRows((j.rows ?? []) as Array<Record<string, unknown>>);
    setPage(p);
  }

  useEffect(() => {
    void load(1);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-[family-name:var(--font-lora)] text-2xl font-semibold">
          Audit log
        </h1>
        <Button type="button" variant="outline" onClick={() => void load(page)}>
          Refresh
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={String(r.id)}>
              <TableCell className="whitespace-nowrap text-xs">
                {r.created_at ? String(r.created_at) : ""}
              </TableCell>
              <TableCell className="text-sm">{String(r.action ?? "")}</TableCell>
              <TableCell className="font-mono text-xs">
                {String(r.target_type ?? "")}:{String(r.target_id ?? "")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={() => void load(page - 1)}
        >
          Prev
        </Button>
        <Button type="button" variant="outline" onClick={() => void load(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
