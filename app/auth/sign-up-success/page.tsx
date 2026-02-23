import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Coffee, Mail } from "lucide-react";

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-center">
            <img src="/crowdroast_logo.svg" alt="CrowdRoast" className="h-24" />
          </div>
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Mail className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl">Check your email</CardTitle>
              <CardDescription>
                We sent you a confirmation link
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-sm text-muted-foreground leading-relaxed">
                Click the link in your email to confirm your account. Once
                confirmed, you can sign in and start trading specialty coffee.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
