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
import { ApiError, apiPost } from "@/lib/api/client";
import {
  otpSendBodySchema,
  otpVerifyBodySchema,
  type OtpSendBody,
  type OtpVerifyBody,
} from "@/lib/auth/schemas";
import { useSupabaseSession } from "@/lib/supabase/session-context";

const verifyOnlySchema = otpVerifyBodySchema.extend({
  email: z.string().email(),
});

function OtpFlow() {
  const router = useRouter();
  const { refreshSession } = useSupabaseSession();
  const params = useSearchParams();
  const presetEmail = params.get("email") ?? "";
  const next = params.get("next") ?? "/account";
  const [step, setStep] = useState<"send" | "verify">(
    presetEmail ? "verify" : "send",
  );
  const [submitting, setSubmitting] = useState(false);

  const sendForm = useForm<OtpSendBody>({
    resolver: zodResolver(otpSendBodySchema),
    defaultValues: { email: presetEmail },
  });

  const verifyForm = useForm<OtpVerifyBody>({
    resolver: zodResolver(verifyOnlySchema),
    defaultValues: { email: presetEmail, token: "" },
  });

  async function onSend(values: OtpSendBody) {
    setSubmitting(true);
    try {
      await apiPost("/api/auth/otp/send", values);
      toast.success("Check your email for the code.");
      verifyForm.setValue("email", values.email);
      setStep("verify");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send code");
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify(values: OtpVerifyBody) {
    setSubmitting(true);
    try {
      await apiPost("/api/auth/otp/verify", values);
      await refreshSession();
      toast.success("Signed in");
      router.refresh();
      router.push(next.startsWith("/") ? next : "/account");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-border shadow-md">
      <CardHeader>
        <CardTitle>Email code</CardTitle>
        <CardDescription>
          Enter your email to receive a one-time code for passwordless sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === "send" ? (
          <Form {...sendForm}>
            <form
              onSubmit={sendForm.handleSubmit(onSend)}
              className="space-y-4"
            >
              <FormField
                control={sendForm.control}
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
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Send code"}
              </Button>
            </form>
          </Form>
        ) : (
          <Form {...verifyForm}>
            <form
              onSubmit={verifyForm.handleSubmit(onVerify)}
              className="space-y-4"
            >
              <FormField
                control={verifyForm.control}
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
                control={verifyForm.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
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
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Verifying…" : "Verify & continue"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setStep("send")}
              >
                Use a different email
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        <Link href="/auth/login" className="text-primary underline">
          Back to log in
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function OtpPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm">Loading…</div>}>
      <OtpFlow />
    </Suspense>
  );
}
