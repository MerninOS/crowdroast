import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminAccount } from "@/lib/auth/admin";

export async function requireAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!isAdminAccount({ email: user.email, role: profile?.role })) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  try {
    const admin = createAdminClient();
    return { user, admin };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Server is missing admin credentials" },
        { status: 500 }
      ),
    };
  }
}
