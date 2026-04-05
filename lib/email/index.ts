/**
 * Email notification service.
 * Each function corresponds to a specific notification event in the app.
 * Import these directly into API routes or cron handlers.
 *
 * All functions return { success: boolean; error?: string }.
 * Callers are responsible for handling failures (e.g. showing "Failed to deliver" UI).
 */

import { sendEmail, sendEmailBatch, SendEmailResult } from "./transport";
import { renderSellerInviteHtml } from "./templates/SellerInvite";
import { renderSampleRequestHtml } from "./templates/SampleRequest";
import { renderBuyerJoinedHubHtml } from "./templates/BuyerJoinedHub";
import { renderNewSellerCoffeesHtml } from "./templates/NewSellerCoffees";
import { renderHubNewCoffeesHtml } from "./templates/HubNewCoffees";
import {
  renderLotClosedBuyerHtml,
  renderLotClosedSellerHtml,
  renderLotClosedHubOwnerHtml,
} from "./templates/LotClosedSuccess";
import { renderLotClosedFailedHtml } from "./templates/LotClosedFailed";
import { renderDeadlineReminderHtml } from "./templates/DeadlineReminder";
import {
  renderPriceDropInvestorHtml,
  renderPriceDropNonInvestorHtml,
} from "./templates/PriceDrop";
import { renderHubAccessRequestHtml } from "./templates/HubAccessRequest";
import { renderHubAccessApprovedHtml } from "./templates/HubAccessApproved";
import { renderHubAccessDeniedHtml } from "./templates/HubAccessDenied";
import { renderBuyerHubInviteHtml } from "./templates/BuyerHubInvite";
import type { Profile, Hub, Lot, Commitment } from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crowdroast.com";

// ---------------------------------------------------------------------------
// AC-1: Seller invitation
// ---------------------------------------------------------------------------

export interface SellerInviteEmailParams {
  recipientEmail: string;
  invitedByName: string;
}

export async function sendSellerInviteEmail(
  params: SellerInviteEmailParams
): Promise<SendEmailResult> {
  const signupUrl = `${APP_URL}/signup?email=${encodeURIComponent(params.recipientEmail)}&role=seller`;
  const html = await renderSellerInviteHtml({
    recipientEmail: params.recipientEmail,
    invitedByName: params.invitedByName,
    signupUrl,
  });
  return sendEmail({
    to: params.recipientEmail,
    subject: "You've been invited to sell your coffee on CrowdRoast",
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-2: Sample request (hub owner → seller)
// ---------------------------------------------------------------------------

export interface SampleRequestEmailParams {
  seller: Pick<Profile, "email" | "contact_name">;
  hubOwner: Pick<Profile, "contact_name" | "company_name">;
  shippingAddress: string;
  sampleItems: { lotTitle: string; quantityGrams: number; notes?: string | null }[];
}

export async function sendSampleRequestEmail(
  params: SampleRequestEmailParams
): Promise<SendEmailResult> {
  if (!params.seller.email) return { success: false, error: "Seller has no email address" };
  const html = await renderSampleRequestHtml({
    sellerName: params.seller.contact_name || "Seller",
    hubOwnerName: params.hubOwner.contact_name || "A hub owner",
    hubOwnerCompany: params.hubOwner.company_name,
    shippingAddress: params.shippingAddress,
    sampleItems: params.sampleItems,
    samplesUrl: `${APP_URL}/dashboard/seller/samples`,
  });
  return sendEmail({
    to: params.seller.email,
    subject: `New sample request from ${params.hubOwner.contact_name || params.hubOwner.company_name || "a hub owner"}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-3: Buyer joined hub (hub owner notification)
// ---------------------------------------------------------------------------

export interface BuyerJoinedHubEmailParams {
  hubOwner: Pick<Profile, "email" | "contact_name">;
  buyer: Pick<Profile, "contact_name" | "company_name">;
  hubName: string;
}

export async function sendBuyerJoinedHubEmail(
  params: BuyerJoinedHubEmailParams
): Promise<SendEmailResult> {
  if (!params.hubOwner.email) return { success: false, error: "Hub owner has no email address" };
  const html = await renderBuyerJoinedHubHtml({
    hubOwnerName: params.hubOwner.contact_name || "Hub Owner",
    hubName: params.hubName,
    buyerName: params.buyer.contact_name || "A buyer",
    buyerCompany: params.buyer.company_name,
  });
  return sendEmail({
    to: params.hubOwner.email,
    subject: `${params.buyer.contact_name || "A buyer"} has joined your hub`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-4: New coffees from seller (hub owner notification)
// ---------------------------------------------------------------------------

export interface NewSellerCoffeesEmailParams {
  hubOwner: Pick<Profile, "email" | "contact_name">;
  sellerName: string;
  newLots: { title: string; originCountry: string; pricePerKg: number; currency: string }[];
}

export async function sendNewSellerCoffeesEmail(
  params: NewSellerCoffeesEmailParams
): Promise<SendEmailResult> {
  if (!params.hubOwner.email) return { success: false, error: "Hub owner has no email address" };
  const html = await renderNewSellerCoffeesHtml({
    hubOwnerName: params.hubOwner.contact_name || "Hub Owner",
    sellerName: params.sellerName,
    newLots: params.newLots,
    catalogUrl: `${APP_URL}/dashboard/hub/catalog`,
  });
  return sendEmail({
    to: params.hubOwner.email,
    subject: `New coffees available from ${params.sellerName}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-5: Hub launched new coffees (buyer notification)
// ---------------------------------------------------------------------------

export interface HubNewCoffeesEmailParams {
  buyer: Pick<Profile, "email" | "contact_name">;
  hubName: string;
  newLots: { title: string; originCountry: string; pricePerKg: number; currency: string }[];
}

export async function sendHubNewCoffeesEmail(
  params: HubNewCoffeesEmailParams
): Promise<SendEmailResult> {
  if (!params.buyer.email) return { success: false, error: "Buyer has no email address" };
  const html = await renderHubNewCoffeesHtml({
    buyerName: params.buyer.contact_name || "there",
    hubName: params.hubName,
    newLots: params.newLots,
    catalogUrl: `${APP_URL}/dashboard/buyer/browse`,
  });
  return sendEmail({
    to: params.buyer.email,
    subject: `New coffees added to ${params.hubName}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-6a: Lot closed successfully — buyer
// ---------------------------------------------------------------------------

export interface LotClosedBuyerEmailParams {
  buyer: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title">;
  commitment: Pick<Commitment, "id" | "total_price" | "quantity_kg">;
}

export async function sendLotClosedBuyerEmail(
  params: LotClosedBuyerEmailParams
): Promise<SendEmailResult> {
  if (!params.buyer.email) return { success: false, error: "Buyer has no email address" };
  const orderUrl = `${APP_URL}/dashboard/buyer/commitments`;
  const html = await renderLotClosedBuyerHtml({
    buyerName: params.buyer.contact_name || "there",
    lotTitle: params.lot.title,
    quantityKg: params.commitment.quantity_kg,
    totalPrice: params.commitment.total_price,
    currency: "USD",
    orderUrl,
  });
  return sendEmail({
    to: params.buyer.email,
    subject: `Your order for ${params.lot.title} is confirmed`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-6b: Lot closed successfully — seller
// ---------------------------------------------------------------------------

export interface LotClosedSellerEmailParams {
  seller: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title" | "total_quantity_kg">;
  hub: Pick<Hub, "name" | "address" | "city" | "state" | "country">;
  totalQuantitySoldKg: number;
}

export async function sendLotClosedSellerEmail(
  params: LotClosedSellerEmailParams
): Promise<SendEmailResult> {
  if (!params.seller.email) return { success: false, error: "Seller has no email address" };
  const hubAddress = [params.hub.address, params.hub.city, params.hub.state, params.hub.country]
    .filter(Boolean)
    .join(", ") || "See your dashboard for shipping details";
  const html = await renderLotClosedSellerHtml({
    sellerName: params.seller.contact_name || "Seller",
    lotTitle: params.lot.title,
    totalQuantityKg: params.totalQuantitySoldKg,
    hubAddress,
    fulfillmentUrl: `${APP_URL}/dashboard/seller/lots`,
  });
  return sendEmail({
    to: params.seller.email,
    subject: `Your lot ${params.lot.title} has closed — prepare for shipment`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-6c: Lot closed successfully — hub owner
// ---------------------------------------------------------------------------

export interface LotClosedHubOwnerEmailParams {
  hubOwner: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title">;
  hubName: string;
}

export async function sendLotClosedHubOwnerEmail(
  params: LotClosedHubOwnerEmailParams
): Promise<SendEmailResult> {
  if (!params.hubOwner.email) return { success: false, error: "Hub owner has no email address" };
  const html = await renderLotClosedHubOwnerHtml({
    hubOwnerName: params.hubOwner.contact_name || "Hub Owner",
    lotTitle: params.lot.title,
    hubName: params.hubName,
    dashboardUrl: `${APP_URL}/dashboard/hub`,
  });
  return sendEmail({
    to: params.hubOwner.email,
    subject: `Payout incoming — ${params.lot.title} has closed`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-6 batch: all lot-closed success emails in a single Resend API call
// ---------------------------------------------------------------------------

export interface LotClosedBatchParams {
  lot: Pick<Lot, "id" | "title" | "total_quantity_kg">;
  buyers: Array<{
    buyer: Pick<Profile, "email" | "contact_name">;
    commitment: Pick<Commitment, "id" | "total_price" | "quantity_kg">;
  }>;
  seller?: Pick<Profile, "email" | "contact_name"> | null;
  hub?: Pick<Hub, "name" | "address" | "city" | "state" | "country"> | null;
  hubOwner?: Pick<Profile, "email" | "contact_name"> | null;
}

export async function sendLotClosedEmailsBatch(
  params: LotClosedBatchParams
): Promise<SendEmailResult> {
  const orderUrl = `${APP_URL}/dashboard/buyer/commitments`;
  const fulfillmentUrl = `${APP_URL}/dashboard/seller/lots`;
  const dashboardUrl = `${APP_URL}/dashboard/hub`;

  const payloads: { to: string; subject: string; html: string }[] = [];

  for (const { buyer, commitment } of params.buyers) {
    if (!buyer.email) continue;
    payloads.push({
      to: buyer.email,
      subject: `Your order for ${params.lot.title} is confirmed`,
      html: await renderLotClosedBuyerHtml({
        buyerName: buyer.contact_name || "there",
        lotTitle: params.lot.title,
        quantityKg: commitment.quantity_kg,
        totalPrice: commitment.total_price,
        currency: "USD",
        orderUrl,
      }),
    });
  }

  if (params.seller?.email && params.hub) {
    const hubAddress = [params.hub.address, params.hub.city, params.hub.state, params.hub.country]
      .filter(Boolean)
      .join(", ") || "See your dashboard for shipping details";
    payloads.push({
      to: params.seller.email,
      subject: `Your lot ${params.lot.title} has closed — prepare for shipment`,
      html: await renderLotClosedSellerHtml({
        sellerName: params.seller.contact_name || "Seller",
        lotTitle: params.lot.title,
        totalQuantityKg: params.lot.total_quantity_kg,
        hubAddress,
        fulfillmentUrl,
      }),
    });
  }

  if (params.hubOwner?.email && params.hub) {
    payloads.push({
      to: params.hubOwner.email,
      subject: `Payout incoming — ${params.lot.title} has closed`,
      html: await renderLotClosedHubOwnerHtml({
        hubOwnerName: params.hubOwner.contact_name || "Hub Owner",
        lotTitle: params.lot.title,
        hubName: params.hub.name,
        dashboardUrl,
      }),
    });
  }

  return sendEmailBatch(payloads);
}

// ---------------------------------------------------------------------------
// AC-7: Lot failed to fund — all parties
// ---------------------------------------------------------------------------

export interface LotFailedEmailParams {
  recipient: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title">;
}

export async function sendLotFailedEmail(
  params: LotFailedEmailParams
): Promise<SendEmailResult> {
  if (!params.recipient.email) return { success: false, error: "Recipient has no email address" };
  const html = await renderLotClosedFailedHtml({
    recipientName: params.recipient.contact_name || "there",
    lotTitle: params.lot.title,
  });
  return sendEmail({
    to: params.recipient.email,
    subject: `The ${params.lot.title} campaign did not reach its funding goal`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Lot expired without successful campaign — notify seller
// ---------------------------------------------------------------------------

export interface LotExpiredEmailParams {
  seller: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title">;
}

export async function sendLotExpiredEmail(
  params: LotExpiredEmailParams
): Promise<SendEmailResult> {
  if (!params.seller.email) return { success: false, error: "Seller has no email address" };
  const html = await renderLotClosedFailedHtml({
    recipientName: params.seller.contact_name || "there",
    lotTitle: params.lot.title,
  });
  return sendEmail({
    to: params.seller.email,
    subject: `Your lot "${params.lot.title}" has expired — consider re-listing`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-8a: Lot deadline reminder (24 hours) — non-investing buyers
// ---------------------------------------------------------------------------

export interface DeadlineReminderEmailParams {
  buyer: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title" | "commitment_deadline" | "price_per_kg">;
  hubName: string;
}

export async function sendDeadlineReminderEmail(
  params: DeadlineReminderEmailParams
): Promise<SendEmailResult> {
  if (!params.buyer.email) return { success: false, error: "Buyer has no email address" };
  const deadline = params.lot.commitment_deadline
    ? new Date(params.lot.commitment_deadline).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      })
    : "Soon";
  const html = await renderDeadlineReminderHtml({
    buyerName: params.buyer.contact_name || "there",
    lotTitle: params.lot.title,
    hubName: params.hubName,
    deadline,
    pricePerKg: params.lot.price_per_kg,
    currency: "USD",
    catalogUrl: `${APP_URL}/dashboard/buyer/browse`,
  });
  return sendEmail({
    to: params.buyer.email,
    subject: `24 hours left to commit on ${params.lot.title}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-8b: Price drop — buyers who have already invested
// ---------------------------------------------------------------------------

export interface PriceDropInvestorEmailParams {
  buyer: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title" | "price_per_kg">;
  newPricePerKg: number;
}

export async function sendPriceDropInvestorEmail(
  params: PriceDropInvestorEmailParams
): Promise<SendEmailResult> {
  if (!params.buyer.email) return { success: false, error: "Buyer has no email address" };
  const html = await renderPriceDropInvestorHtml({
    buyerName: params.buyer.contact_name || "there",
    lotTitle: params.lot.title,
    oldPricePerKg: params.lot.price_per_kg,
    newPricePerKg: params.newPricePerKg,
    currency: "USD",
    catalogUrl: `${APP_URL}/dashboard/buyer/browse`,
  });
  return sendEmail({
    to: params.buyer.email,
    subject: `Price dropped on ${params.lot.title} — you can buy more`,
    html,
  });
}

// ---------------------------------------------------------------------------
// AC-8c: Price drop — buyers who have not yet invested
// ---------------------------------------------------------------------------

export interface PriceDropNonInvestorEmailParams {
  buyer: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title" | "price_per_kg" | "commitment_deadline">;
  newPricePerKg: number;
  hubName: string;
}

export async function sendPriceDropNonInvestorEmail(
  params: PriceDropNonInvestorEmailParams
): Promise<SendEmailResult> {
  if (!params.buyer.email) return { success: false, error: "Buyer has no email address" };
  const deadline = params.lot.commitment_deadline
    ? new Date(params.lot.commitment_deadline).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      })
    : "Soon";
  const html = await renderPriceDropNonInvestorHtml({
    buyerName: params.buyer.contact_name || "there",
    lotTitle: params.lot.title,
    oldPricePerKg: params.lot.price_per_kg,
    newPricePerKg: params.newPricePerKg,
    currency: "USD",
    deadline,
    catalogUrl: `${APP_URL}/dashboard/buyer/browse`,
  });
  return sendEmail({
    to: params.buyer.email,
    subject: `Price just dropped on ${params.lot.title}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Buyer hub invite (hub owner → new user who doesn't have an account yet)
// ---------------------------------------------------------------------------

export interface BuyerHubInviteEmailParams {
  recipientEmail: string;
  invitedByName: string;
  hubName: string;
}

export async function sendBuyerHubInviteEmail(
  params: BuyerHubInviteEmailParams
): Promise<SendEmailResult> {
  const signupUrl = `${APP_URL}/auth/sign-up?email=${encodeURIComponent(params.recipientEmail)}`;
  const html = await renderBuyerHubInviteHtml({
    recipientEmail: params.recipientEmail,
    invitedByName: params.invitedByName,
    hubName: params.hubName,
    signupUrl,
  });
  return sendEmail({
    to: params.recipientEmail,
    subject: `You've been invited to join ${params.hubName} on CrowdRoast`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Hub access request (buyer → hub owner notification)
// ---------------------------------------------------------------------------

export interface HubAccessRequestEmailParams {
  hubOwner: Pick<Profile, "email" | "contact_name">;
  buyer: Pick<Profile, "contact_name" | "company_name" | "email">;
  hubName: string;
}

export async function sendHubAccessRequestEmail(
  params: HubAccessRequestEmailParams
): Promise<SendEmailResult> {
  if (!params.hubOwner.email) return { success: false, error: "Hub owner has no email address" };
  if (!params.buyer.email) return { success: false, error: "Buyer has no email address" };
  const html = await renderHubAccessRequestHtml({
    hubOwnerName: params.hubOwner.contact_name || "Hub Owner",
    hubName: params.hubName,
    buyerName: params.buyer.contact_name || "A buyer",
    buyerCompany: params.buyer.company_name || null,
    buyerEmail: params.buyer.email,
    membersUrl: `${APP_URL}/dashboard/hub/members`,
  });
  return sendEmail({
    to: params.hubOwner.email,
    subject: `${params.buyer.contact_name || "A buyer"} is requesting to join ${params.hubName}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Hub access approved (hub owner → buyer notification)
// ---------------------------------------------------------------------------

export interface HubAccessApprovedEmailParams {
  buyer: Pick<Profile, "email" | "contact_name">;
  hubName: string;
}

export async function sendHubAccessApprovedEmail(
  params: HubAccessApprovedEmailParams
): Promise<SendEmailResult> {
  if (!params.buyer.email) return { success: false, error: "Buyer has no email address" };
  const html = await renderHubAccessApprovedHtml({
    buyerName: params.buyer.contact_name || "there",
    hubName: params.hubName,
    dashboardUrl: `${APP_URL}/dashboard/buyer`,
  });
  return sendEmail({
    to: params.buyer.email,
    subject: `You're in — welcome to ${params.hubName}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Hub access denied (hub owner → buyer notification)
// ---------------------------------------------------------------------------

export interface HubAccessDeniedEmailParams {
  buyer: Pick<Profile, "email" | "contact_name">;
  hubName: string;
}

export async function sendHubAccessDeniedEmail(
  params: HubAccessDeniedEmailParams
): Promise<SendEmailResult> {
  if (!params.buyer.email) return { success: false, error: "Buyer has no email address" };
  const html = await renderHubAccessDeniedHtml({
    buyerName: params.buyer.contact_name || "there",
    hubName: params.hubName,
    findHubUrl: `${APP_URL}/dashboard/find-hub`,
  });
  return sendEmail({
    to: params.buyer.email,
    subject: `Update on your request to join ${params.hubName}`,
    html,
  });
}
