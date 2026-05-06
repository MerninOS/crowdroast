import { describe, it, expect } from "vitest";
import { renderReferralCreditEarnedHtml } from "@/lib/email/templates/ReferralCreditEarned";

describe("ReferralCreditEarned template", () => {
  it("renders inviter name, invitee name, $10, lot title, and the auto-apply phrasing", async () => {
    const html = await renderReferralCreditEarnedHtml({
      inviterName: "Alice",
      inviteeName: "Bob",
      lotTitle: "Yirgacheffe G1",
      dashboardUrl: "https://crowdroast.test/dashboard/buyer",
    });
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("$10");
    expect(html).toContain("Yirgacheffe G1");
    expect(html).toContain("auto-apply");
  });

  it("omits the lot phrase gracefully when lotTitle is null", async () => {
    const html = await renderReferralCreditEarnedHtml({
      inviterName: "Alice",
      inviteeName: "Bob",
      lotTitle: null,
      dashboardUrl: "https://crowdroast.test/dashboard/buyer",
    });
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).not.toContain("on null");
    expect(html).not.toContain("on  just");
  });
});
