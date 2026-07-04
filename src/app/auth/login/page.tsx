"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { loginBodySchema, type LoginBody } from "@/lib/auth/schemas";
import { useSupabaseSession } from "@/lib/supabase/session-context";

function LoginForm() {
  const router = useRouter();
  const { refreshSession } = useSupabaseSession();
  const params = useSearchParams();
  const next = params.get("next") ?? "/account";
  const errParam = params.get("error");
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<LoginBody>({
    resolver: zodResolver(loginBodySchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginBody) {
    setSubmitting(true);
    try {
      await apiPost("/api/auth/login", values);
      await refreshSession();
      toast.success("Welcome back");
      router.refresh();
      router.push(next.startsWith("/") ? next : "/account");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not sign in";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-border shadow-md">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Use your email and password, or try a one-time code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errParam ? (
          <Alert variant="destructive">
            <AlertTitle>Could not complete sign-in</AlertTitle>
            <AlertDescription>{errParam}</AlertDescription>
          </Alert>
        ) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Continue"}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 text-sm text-muted-foreground">
        <Link href="/auth/reset-password" className="text-primary underline">
          Forgot password?
        </Link>
        <div>
          New here?{" "}
          <Link href="/auth/signup" className="font-medium text-primary underline">
            Create an account
          </Link>
        </div>
        <Link href="/auth/otp" className="text-primary underline">
          Email me a code instead
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
