import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader variant="light" />
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="max-w-md border-border shadow-md">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-lora)]">
              Access denied
            </CardTitle>
            <CardDescription>
              You don&apos;t have permission to view this page. Sign in with the
              right account or go back home.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/auth/login?next=/account">Log in</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
