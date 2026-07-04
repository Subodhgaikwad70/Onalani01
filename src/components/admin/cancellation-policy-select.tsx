"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_CANCELLATION_POLICY_KEY } from "@/lib/bookings/cancellation-policies";

export function CancellationPolicySelect({
  id,
  value,
  onValueChange,
  disabled,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["cancellation-policies"],
    queryFn: async () => {
      const res = await fetch("/api/cancellation-policies");
      if (!res.ok) throw new Error("policies");
      return res.json() as Promise<{
        policies: Array<{ id: string; key: string; label: string }>;
        default_key: string;
      }>;
    },
  });

  const policies = data?.policies ?? [];

  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled || isPending || policies.length === 0}
    >
      <SelectTrigger id={id} className="border-[#dfe6e1]">
        <SelectValue
          placeholder={isPending ? "Loading policies…" : "Select policy"}
        />
      </SelectTrigger>
      <SelectContent>
        {policies.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label}
            {p.key === DEFAULT_CANCELLATION_POLICY_KEY ? " (default)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
