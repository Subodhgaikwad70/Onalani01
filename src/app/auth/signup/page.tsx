"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError, apiPost } from "@/lib/api/client";
import { signupBodySchema, type SignupBody } from "@/lib/auth/schemas";
import { useSupabaseSession } from "@/lib/supabase/session-context";

type SignupResponse = {
  user: { id: string; email: string | null } | null;
  needs_verification: boolean;
};

function SignupForm() {
  const router = useRouter();
  const { refreshSession } = useSupabaseSession();
  const params = useSearchParams();
  const next = params.get("next") ?? "/account";
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<SignupBody>({
    resolver: zodResolver(signupBodySchema),
    defaultValues: {
      email: "",
      password: "",
      display_name: "",
    },
  });

  async function onSubmit(values: SignupBody) {
    setSubmitting(true);
    try {
      const res = await apiPost<SignupResponse>("/api/auth/signup", {
        ...values,
        next,
      });
      if (res.needs_verification) {
        toast.success("Check your email to verify your account.");
        router.push(
          `/auth/verify?email=${encodeURIComponent(values.email)}&next=${encodeURIComponent(next)}`,
        );
        return;
      }
      toast.success("Account created");
      await refreshSession();
      router.refresh();
      router.push(next.startsWith("/") ? next : "/account");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not sign up";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-border shadow-md">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Join Onalani to book stays and message hosts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating…" : "Sign up"}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 text-sm text-muted-foreground">
        <div>
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-primary underline">
            Log in
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm">Loading…</div>}>
      <SignupForm />
    </Suspense>
  );
}
