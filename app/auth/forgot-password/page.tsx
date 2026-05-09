"use client";

import React from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@merninos/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@merninos/ui";
import { Input } from "@merninos/ui";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import { Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-secondary/30 p-4 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-center">
            <img src="/crowdroast_logo.png" alt="CrowdRoast" className="h-18" />
          </div>
          <Card className="shadow-md">
            {submitted ? (
              <>
                <CardHeader className="text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Mail className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl">Check your email</CardTitle>
                  <CardDescription>
                    We sent a password reset link to {email}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-center text-sm text-muted-foreground leading-relaxed">
                    Click the link in your email to choose a new password. If
                    you don&apos;t see it, check your spam folder.
                  </p>
                  <div className="mt-6 text-center text-sm text-muted-foreground">
                    <Link
                      href="/auth/login"
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      Back to sign in
                    </Link>
                  </div>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-2xl">Reset your password</CardTitle>
                  <CardDescription>
                    Enter your email and we&apos;ll send you a link to reset your
                    password.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleResetRequest} suppressHydrationWarning>
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-2" suppressHydrationWarning>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@company.com"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      {error && (
                        <p className="text-sm text-destructive">{error}</p>
                      )}
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                      >
                        {isLoading ? "Sending..." : "Send reset link"}
                      </Button>
                    </div>
                    <div className="mt-4 text-center text-sm text-muted-foreground">
                      Remembered it?{" "}
                      <Link
                        href="/auth/login"
                        className="font-medium text-primary underline underline-offset-4"
                      >
                        Sign in
                      </Link>
                    </div>
                  </form>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
