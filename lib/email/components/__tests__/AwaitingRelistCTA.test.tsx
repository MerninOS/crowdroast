import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import { AwaitingRelistCTA } from "../AwaitingRelistCTA";

describe("AwaitingRelistCTA", () => {
  it("renders the review button with the provided url", async () => {
    const html = await render(
      <AwaitingRelistCTA
        lotTitle="Ethiopian Yirgacheffe"
        reviewUrl="https://example.com/dashboard/seller/lots#needs-review"
      />
    );

    expect(html).toContain("Review your lot");
    expect(html).toContain("https://example.com/dashboard/seller/lots#needs-review");
  });

  it("includes the lot title in the body copy", async () => {
    const html = await render(
      <AwaitingRelistCTA
        lotTitle="Colombian Supremo"
        reviewUrl="https://example.com/x"
      />
    );

    expect(html).toContain("Colombian Supremo");
    expect(html).toContain("Needs Review");
  });
});
