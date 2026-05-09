"use client";

import React, { Suspense, useEffect, useState } from "react";

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
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

export default function UpdatePasswordPage() {
  return (
    <Suspense>
      <UpdatePasswordForm />
    </Suspense>
  );
}

function UpdatePasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [exchanging, setExchanging] = useState(true);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  // Supabase's resetPasswordForEmail (PKCE flow) redirects here with ?code=...
  // We need to exchange that code for a session before the user can update
  // their password. If a session already exists (e.g. user was already logged
  // in), we skip straight to the form.
  useEffect(() => {
    const supabase = createClient();
    const code = searchParams.get("code");

    const run = async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            setExchangeError(
              "This reset link is invalid or has expired. Please request a new one.",
            );
          }
        }
      } catch (err: unknown) {
        setExchangeError(
          err instanceof Error
            ? err.message
            : "Could not verify the reset link.",
        );
      } finally {
        setExchanging(false);
      }
    };

    run();
  }, [searchParams]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== repeatPassword) {
      setError("Passwords do not match");
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1500);
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
            {success ? (
              <>
                <CardHeader className="text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl">Password updated</CardTitle>
                  <CardDescription>
                    Redirecting you to your dashboard...
                  </CardDescription>
                </CardHeader>
              </>
            ) : exchanging ? (
              <CardHeader>
                <CardTitle className="text-2xl">Verifying link...</CardTitle>
                <CardDescription>One moment.</CardDescription>
              </CardHeader>
            ) : exchangeError ? (
              <>
                <CardHeader>
                  <CardTitle className="text-2xl">Link unavailable</CardTitle>
                  <CardDescription>{exchangeError}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href="/auth/forgot-password">
                      Request a new link
                    </Link>
                  </Button>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-2xl">Set a new password</CardTitle>
                  <CardDescription>
                    Choose a new password for your account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdate} suppressHydrationWarning>
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-2" suppressHydrationWarning>
                        <Label htmlFor="password">New password</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            required
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                            aria-pressed={showPassword}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2" suppressHydrationWarning>
                        <Label htmlFor="repeat-password">
                          Confirm new password
                        </Label>
                        <div className="relative">
                          <Input
                            id="repeat-password"
                            type={showRepeatPassword ? "text" : "password"}
                            required
                            autoComplete="new-password"
                            value={repeatPassword}
                            onChange={(e) => setRepeatPassword(e.target.value)}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRepeatPassword((v) => !v)}
                            aria-label={
                              showRepeatPassword
                                ? "Hide password"
                                : "Show password"
                            }
                            aria-pressed={showRepeatPassword}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showRepeatPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      {error && (
                        <p className="text-sm text-destructive">{error}</p>
                      )}
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                      >
                        {isLoading ? "Saving..." : "Update password"}
                      </Button>
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
