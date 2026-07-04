"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiPost } from "@/lib/api/client";
import {
  signupVerifyOtpBodySchema,
  type SignupVerifyOtpBody,
} from "@/lib/auth/schemas";
import { useSupabaseSession } from "@/lib/supabase/session-context";

const verifyFormSchema = signupVerifyOtpBodySchema.extend({
  email: z.string().email(),
});

function VerifyEmailForm() {
  const router = useRouter();
  const { refreshSession } = useSupabaseSession();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const next = params.get("next") ?? "/account";
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const form = useForm<SignupVerifyOtpBody & { email: string }>({
    resolver: zodResolver(verifyFormSchema),
    defaultValues: { email, token: "" },
  });

  async function onResend() {
    if (!email) {
      toast.error("Missing email address");
      return;
    }
    setResending(true);
    try {
      await apiPost("/api/auth/signup/resend", { email, next });
      toast.success("Confirmation email sent. Check your inbox.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not resend email");
    } finally {
      setResending(false);
    }
  }

  async function onVerifyOtp(values: SignupVerifyOtpBody & { email: string }) {
    setVerifying(true);
    try {
      await apiPost("/api/auth/signup/verify-otp", {
        email: values.email,
        token: values.token,
      });
      await refreshSession();
      toast.success("Account verified");
      router.refresh();
      router.push(next.startsWith("/") ? next : "/account");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Invalid code");
    } finally {
      setVerifying(false);
    }
  }

  if (!email) {
    return (
      <Card className="border-border shadow-md">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            We could not find your email address. Please sign up again.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/auth/signup" className="text-sm text-primary underline">
            Back to sign up
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-md">
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          We sent a confirmation to{" "}
          <span className="font-medium text-foreground">{email}</span>. Choose
          how you would like to verify your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="link" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">Confirmation link</TabsTrigger>
            <TabsTrigger value="otp">OTP code</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Open the email we sent and click the confirmation link. You will
              be signed in automatically once verified.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={resending}
              onClick={onResend}
            >
              {resending ? "Sending…" : "Resend confirmation email"}
            </Button>
          </TabsContent>

          <TabsContent value="otp">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onVerifyOtp)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          readOnly
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification code</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="123456"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifying}
                >
                  {verifying ? "Verifying…" : "Verify with code"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={resending}
                  onClick={onResend}
                >
                  {resending ? "Sending…" : "Resend code"}
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        <Link href="/auth/login" className="text-primary underline">
          Back to log in
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm">Loading…</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
