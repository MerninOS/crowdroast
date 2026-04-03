/**
 * Pattern 1 — User-Action Triggered
 *
 * Tests all named send functions in lib/email/index.ts.
 * Mocks the transport layer so no real emails are sent.
 * Asserts that sendEmail is called with the expected recipient and subject.
 *
 * Pattern 3 — Conditional Recipients (guard tests)
 *
 * Each send function guards against a missing email address.
 * Asserts that sendEmail is NOT called and { success: false } is returned.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock transport first — must be before any imports that pull in transport.ts,
// because transport.ts throws at module load if RESEND_API_KEY is absent.
vi.mock("@/lib/email/transport", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock all render functions to return a stable HTML string.
// We're testing orchestration (who gets what subject), not template output.
vi.mock("@/lib/email/templates/SellerInvite", () => ({
  renderSellerInviteHtml: vi.fn().mockResolvedValue("<html>invite</html>"),
}));
vi.mock("@/lib/email/templates/SampleRequest", () => ({
  renderSampleRequestHtml: vi.fn().mockResolvedValue("<html>sample</html>"),
}));
vi.mock("@/lib/email/templates/BuyerJoinedHub", () => ({
  renderBuyerJoinedHubHtml: vi.fn().mockResolvedValue("<html>joined</html>"),
}));
vi.mock("@/lib/email/templates/NewSellerCoffees", () => ({
  renderNewSellerCoffeesHtml: vi.fn().mockResolvedValue("<html>new-seller</html>"),
}));
vi.mock("@/lib/email/templates/HubNewCoffees", () => ({
  renderHubNewCoffeesHtml: vi.fn().mockResolvedValue("<html>hub-new</html>"),
}));
vi.mock("@/lib/email/templates/LotClosedSuccess", () => ({
  renderLotClosedBuyerHtml: vi.fn().mockResolvedValue("<html>closed-buyer</html>"),
  renderLotClosedSellerHtml: vi.fn().mockResolvedValue("<html>closed-seller</html>"),
  renderLotClosedHubOwnerHtml: vi.fn().mockResolvedValue("<html>closed-hub</html>"),
}));
vi.mock("@/lib/email/templates/LotClosedFailed", () => ({
  renderLotClosedFailedHtml: vi.fn().mockResolvedValue("<html>failed</html>"),
}));
vi.mock("@/lib/email/templates/DeadlineReminder", () => ({
  renderDeadlineReminderHtml: vi.fn().mockResolvedValue("<html>reminder</html>"),
}));
vi.mock("@/lib/email/templates/PriceDrop", () => ({
  renderPriceDropInvestorHtml: vi.fn().mockResolvedValue("<html>drop-investor</html>"),
  renderPriceDropNonInvestorHtml: vi.fn().mockResolvedValue("<html>drop-non</html>"),
}));
vi.mock("@/lib/email/templates/HubAccessRequest", () => ({
  renderHubAccessRequestHtml: vi.fn().mockResolvedValue("<html>hub-request</html>"),
}));
vi.mock("@/lib/email/templates/HubAccessApproved", () => ({
  renderHubAccessApprovedHtml: vi.fn().mockResolvedValue("<html>hub-approved</html>"),
}));
vi.mock("@/lib/email/templates/HubAccessDenied", () => ({
  renderHubAccessDeniedHtml: vi.fn().mockResolvedValue("<html>hub-denied</html>"),
}));

import { sendEmail } from "@/lib/email/transport";
import {
  sendSellerInviteEmail,
  sendSampleRequestEmail,
  sendBuyerJoinedHubEmail,
  sendNewSellerCoffeesEmail,
  sendHubNewCoffeesEmail,
  sendLotClosedBuyerEmail,
  sendLotClosedSellerEmail,
  sendLotClosedHubOwnerEmail,
  sendLotFailedEmail,
  sendDeadlineReminderEmail,
  sendPriceDropInvestorEmail,
  sendPriceDropNonInvestorEmail,
  sendHubAccessRequestEmail,
  sendHubAccessApprovedEmail,
  sendHubAccessDeniedEmail,
} from "@/lib/email";

const mockSendEmail = vi.mocked(sendEmail);

beforeEach(() => {
  mockSendEmail.mockClear();
});

// ---------------------------------------------------------------------------
// AC-1: Seller invitation
// ---------------------------------------------------------------------------

describe("sendSellerInviteEmail", () => {
  it("sends to the recipient with an invite subject", async () => {
    const result = await sendSellerInviteEmail({
      recipientEmail: "seller@example.com",
      invitedByName: "Admin User",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "seller@example.com",
        subject: expect.stringContaining("invited"),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// AC-2: Sample request
// ---------------------------------------------------------------------------

describe("sendSampleRequestEmail", () => {
  it("sends to the seller with a sample request subject", async () => {
    const result = await sendSampleRequestEmail({
      seller: { email: "seller@farm.com", contact_name: "Maria" },
      hubOwner: { contact_name: "Carlos", company_name: "Pacific Roasters" },
      shippingAddress: "123 Hub St, Portland OR 97201",
      sampleItems: [{ lotTitle: "Ethiopia Natural", quantityGrams: 200 }],
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "seller@farm.com" })
    );
  });

  it("returns { success: false } without sending if seller has no email", async () => {
    const result = await sendSampleRequestEmail({
      seller: { email: null, contact_name: "Maria" },
      hubOwner: { contact_name: "Carlos", company_name: null },
      shippingAddress: "123 Hub St",
      sampleItems: [{ lotTitle: "Ethiopia Natural", quantityGrams: 200 }],
    });

    expect(result).toEqual({ success: false, error: expect.any(String) });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-3: Buyer joined hub
// ---------------------------------------------------------------------------

describe("sendBuyerJoinedHubEmail", () => {
  it("sends to the hub owner with the buyer's name in the subject", async () => {
    const result = await sendBuyerJoinedHubEmail({
      hubOwner: { email: "owner@hub.com", contact_name: "Carlos" },
      buyer: { contact_name: "Alice", company_name: "Alice's Roastery" },
      hubName: "Portland Hub",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@hub.com",
        subject: expect.stringContaining("Alice"),
      })
    );
  });

  it("returns { success: false } without sending if hub owner has no email", async () => {
    const result = await sendBuyerJoinedHubEmail({
      hubOwner: { email: null, contact_name: "Carlos" },
      buyer: { contact_name: "Alice", company_name: null },
      hubName: "Portland Hub",
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-4: New coffees from seller (Pattern 3 — conditional recipients)
// ---------------------------------------------------------------------------

describe("sendNewSellerCoffeesEmail", () => {
  it("sends to the hub owner with the seller name in subject", async () => {
    const result = await sendNewSellerCoffeesEmail({
      hubOwner: { email: "owner@hub.com", contact_name: "Carlos" },
      sellerName: "Yirgacheffe Farm",
      newLots: [{ title: "Ethiopia Washed", originCountry: "Ethiopia", pricePerKg: 12.5, currency: "USD" }],
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@hub.com",
        subject: expect.stringContaining("Yirgacheffe Farm"),
      })
    );
  });

  it("does not send if hub owner has no email (Pattern 3 — no qualifying relationship)", async () => {
    const result = await sendNewSellerCoffeesEmail({
      hubOwner: { email: null, contact_name: "Carlos" },
      sellerName: "Yirgacheffe Farm",
      newLots: [{ title: "Ethiopia Washed", originCountry: "Ethiopia", pricePerKg: 12.5, currency: "USD" }],
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-5: Hub launched new coffees
// ---------------------------------------------------------------------------

describe("sendHubNewCoffeesEmail", () => {
  it("sends to the buyer with the hub name in subject", async () => {
    const result = await sendHubNewCoffeesEmail({
      buyer: { email: "buyer@roastery.com", contact_name: "Alice" },
      hubName: "Portland Hub",
      newLots: [{ title: "Colombia Pink Bourbon", originCountry: "Colombia", pricePerKg: 14, currency: "USD" }],
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@roastery.com",
        subject: expect.stringContaining("Portland Hub"),
      })
    );
  });

  it("returns { success: false } without sending if buyer has no email", async () => {
    const result = await sendHubNewCoffeesEmail({
      buyer: { email: null, contact_name: "Alice" },
      hubName: "Portland Hub",
      newLots: [],
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-6a: Lot closed — buyer
// ---------------------------------------------------------------------------

describe("sendLotClosedBuyerEmail", () => {
  it("sends to buyer with lot title in subject", async () => {
    const result = await sendLotClosedBuyerEmail({
      buyer: { email: "buyer@roastery.com", contact_name: "Alice" },
      lot: { id: "lot-uuid-1", title: "Ethiopia Natural" },
      commitment: { id: "comm-uuid-1", total_price: 500, quantity_kg: 40 },
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@roastery.com",
        subject: expect.stringContaining("Ethiopia Natural"),
      })
    );
  });

  it("returns { success: false } without sending if buyer has no email", async () => {
    const result = await sendLotClosedBuyerEmail({
      buyer: { email: null, contact_name: "Alice" },
      lot: { id: "lot-uuid-1", title: "Ethiopia Natural" },
      commitment: { id: "comm-uuid-1", total_price: 500, quantity_kg: 40 },
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-6b: Lot closed — seller
// ---------------------------------------------------------------------------

describe("sendLotClosedSellerEmail", () => {
  it("sends to seller with shipment instruction subject", async () => {
    const result = await sendLotClosedSellerEmail({
      seller: { email: "seller@farm.com", contact_name: "Maria" },
      lot: { id: "lot-uuid-1", title: "Ethiopia Natural", total_quantity_kg: 200 },
      hub: { name: "Portland Hub", address: "123 Main St", city: "Portland", state: "OR", country: "USA" },
      totalQuantitySoldKg: 180,
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "seller@farm.com",
        subject: expect.stringContaining("Ethiopia Natural"),
      })
    );
  });

  it("returns { success: false } without sending if seller has no email", async () => {
    const result = await sendLotClosedSellerEmail({
      seller: { email: null, contact_name: "Maria" },
      lot: { id: "lot-uuid-1", title: "Ethiopia Natural", total_quantity_kg: 200 },
      hub: { name: "Portland Hub", address: null, city: null, state: null, country: null },
      totalQuantitySoldKg: 180,
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-6c: Lot closed — hub owner
// ---------------------------------------------------------------------------

describe("sendLotClosedHubOwnerEmail", () => {
  it("sends to hub owner with payout subject", async () => {
    const result = await sendLotClosedHubOwnerEmail({
      hubOwner: { email: "owner@hub.com", contact_name: "Carlos" },
      lot: { id: "lot-uuid-1", title: "Ethiopia Natural" },
      hubName: "Portland Hub",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@hub.com",
        subject: expect.stringContaining("Ethiopia Natural"),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// AC-7: Lot failed
// ---------------------------------------------------------------------------

describe("sendLotFailedEmail", () => {
  it("sends to a seller with campaign failed subject", async () => {
    const result = await sendLotFailedEmail({
      recipient: { email: "seller@farm.com", contact_name: "Maria" },
      lot: { id: "lot-uuid-1", title: "Colombia Pink Bourbon" },
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "seller@farm.com",
        subject: expect.stringContaining("Colombia Pink Bourbon"),
      })
    );
  });

  it("sends to a buyer with the same failed subject", async () => {
    await sendLotFailedEmail({
      recipient: { email: "buyer@roastery.com", contact_name: "Alice" },
      lot: { id: "lot-uuid-1", title: "Colombia Pink Bourbon" },
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "buyer@roastery.com" })
    );
  });

  it("returns { success: false } without sending if recipient has no email", async () => {
    const result = await sendLotFailedEmail({
      recipient: { email: null, contact_name: "Maria" },
      lot: { id: "lot-uuid-1", title: "Colombia Pink Bourbon" },
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-8a: Deadline reminder
// ---------------------------------------------------------------------------

describe("sendDeadlineReminderEmail", () => {
  it("sends to buyer with 24 hours left subject", async () => {
    const deadline = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    const result = await sendDeadlineReminderEmail({
      buyer: { email: "buyer@roastery.com", contact_name: "Alice" },
      lot: { id: "lot-uuid-1", title: "Kenya AA", commitment_deadline: deadline, price_per_kg: 11 },
      hubName: "Portland Hub",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@roastery.com",
        subject: expect.stringContaining("Kenya AA"),
      })
    );
  });

  it("returns { success: false } without sending if buyer has no email", async () => {
    const result = await sendDeadlineReminderEmail({
      buyer: { email: null, contact_name: "Alice" },
      lot: { id: "lot-uuid-1", title: "Kenya AA", commitment_deadline: null, price_per_kg: 11 },
      hubName: "Portland Hub",
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-8b/c: Price drop
// ---------------------------------------------------------------------------

describe("sendPriceDropInvestorEmail", () => {
  it("sends to investor with price drop subject", async () => {
    const result = await sendPriceDropInvestorEmail({
      buyer: { email: "investor@roastery.com", contact_name: "Alice" },
      lot: { id: "lot-uuid-1", title: "Ethiopia Natural", price_per_kg: 15 },
      newPricePerKg: 12,
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "investor@roastery.com",
        subject: expect.stringContaining("Ethiopia Natural"),
      })
    );
  });
});

describe("sendPriceDropNonInvestorEmail", () => {
  it("sends to non-investor with price drop subject", async () => {
    const deadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const result = await sendPriceDropNonInvestorEmail({
      buyer: { email: "prospect@roastery.com", contact_name: "Bob" },
      lot: { id: "lot-uuid-1", title: "Ethiopia Natural", price_per_kg: 15, commitment_deadline: deadline },
      newPricePerKg: 12,
      hubName: "Seattle Hub",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "prospect@roastery.com" })
    );
  });

  it("returns { success: false } without sending if buyer has no email", async () => {
    const result = await sendPriceDropNonInvestorEmail({
      buyer: { email: null, contact_name: "Bob" },
      lot: { id: "lot-uuid-1", title: "Ethiopia Natural", price_per_kg: 15, commitment_deadline: null },
      newPricePerKg: 12,
      hubName: "Seattle Hub",
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hub access request (buyer → hub owner notification)
// ---------------------------------------------------------------------------

describe("sendHubAccessRequestEmail", () => {
  it("sends to hub owner with buyer name in subject", async () => {
    const result = await sendHubAccessRequestEmail({
      hubOwner: { email: "owner@hub.com", contact_name: "Carlos" },
      buyer: { contact_name: "Alice", company_name: "Alice's Roastery", email: "alice@roastery.com" },
      hubName: "Portland Hub",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@hub.com",
        subject: expect.stringContaining("Alice"),
      })
    );
  });

  it("returns { success: false } without sending if hub owner has no email", async () => {
    const result = await sendHubAccessRequestEmail({
      hubOwner: { email: null, contact_name: "Carlos" },
      buyer: { contact_name: "Alice", company_name: null, email: "alice@roastery.com" },
      hubName: "Portland Hub",
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns { success: false } without sending if buyer has no email", async () => {
    const result = await sendHubAccessRequestEmail({
      hubOwner: { email: "owner@hub.com", contact_name: "Carlos" },
      buyer: { contact_name: "Alice", company_name: null, email: null },
      hubName: "Portland Hub",
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hub access approved (hub owner → buyer notification)
// ---------------------------------------------------------------------------

describe("sendHubAccessApprovedEmail", () => {
  it("sends to buyer with hub name in subject", async () => {
    const result = await sendHubAccessApprovedEmail({
      buyer: { email: "alice@roastery.com", contact_name: "Alice" },
      hubName: "Portland Hub",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@roastery.com",
        subject: expect.stringContaining("Portland Hub"),
      })
    );
  });

  it("returns { success: false } without sending if buyer has no email", async () => {
    const result = await sendHubAccessApprovedEmail({
      buyer: { email: null, contact_name: "Alice" },
      hubName: "Portland Hub",
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hub access denied (hub owner → buyer notification)
// ---------------------------------------------------------------------------

describe("sendHubAccessDeniedEmail", () => {
  it("sends to buyer with hub name in subject", async () => {
    const result = await sendHubAccessDeniedEmail({
      buyer: { email: "alice@roastery.com", contact_name: "Alice" },
      hubName: "Portland Hub",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@roastery.com",
        subject: expect.stringContaining("Portland Hub"),
      })
    );
  });

  it("returns { success: false } without sending if buyer has no email", async () => {
    const result = await sendHubAccessDeniedEmail({
      buyer: { email: null, contact_name: "Alice" },
      hubName: "Portland Hub",
    });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
