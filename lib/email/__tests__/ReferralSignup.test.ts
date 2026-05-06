import { describe, it, expect } from "vitest";
import { renderReferralSignupHtml } from "@/lib/email/templates/ReferralSignup";

describe("ReferralSignup template", () => {
  it("renders inviter, invitee, and hub names into the body", async () => {
    const html = await renderReferralSignupHtml({
      inviterName: "Alice",
      inviteeName: "Bob",
      inviteeCompany: "Bob's Roastery",
      hubName: "East Side",
    });
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("East Side");
    expect(html).toContain("$10");
  });

  it("uses 'A new roaster' fallback handled by the wrapper, not the template", async () => {
    // Template trusts the props it gets; defaulting happens in
    // sendReferralSignupEmail. The template just renders what it's given.
    const html = await renderReferralSignupHtml({
      inviterName: "Alice",
      inviteeName: "A new roaster",
      inviteeCompany: null,
      hubName: "East Side",
    });
    expect(html).toContain("A new roaster");
    // No '(null)' from a missing company.
    expect(html).not.toContain("(null)");
  });
});
