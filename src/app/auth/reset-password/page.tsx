"use client";

import Link from "next/link";
import { useState } from "react";
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
import { resetRequestBodySchema, type ResetRequestBody } from "@/lib/auth/schemas";

export default function ResetPasswordRequestPage() {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ResetRequestBody>({
    resolver: zodResolver(resetRequestBodySchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ResetRequestBody) {
    setSubmitting(true);
    try {
      await apiPost("/api/auth/reset-password", values);
      setDone(true);
      toast.success("If that email is registered, you will receive a reset link.");
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : "Could not send reset email";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-border shadow-md">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>
          We&apos;ll email you a link to choose a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-sm text-muted-foreground">
            Check your inbox and follow the link. You can close this page.
          </p>
        ) : (
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
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Send reset link"}
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
