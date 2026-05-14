export type UserRole = "buyer" | "seller" | "hub_owner" | "admin";

export type LotStatus =
  | "draft"
  | "active"
  | "awaiting_relist"
  | "fully_committed"
  | "shipped"
  | "delivered"
  | "closed"
  | "expired";

export type CommitmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "shipped"
  | "delivered";

export type CommitmentPaymentStatus =
  | "pending_setup"
  | "setup_complete"
  | "charge_succeeded"
  | "charge_failed"
  | "cancelled";

export type LotSettlementStatus =
  | "pending"
  | "settled"
  | "minimum_not_met"
  | "failed";

export type CampaignStatus = "active" | "settled" | "failed" | "cancelled";

export type SampleStatus =
  | "pending"
  | "approved"
  | "shipped"
  | "delivered"
  | "rejected";

export type ShipmentStatus =
  | "pending"
  | "in_transit"
  | "at_hub"
  | "out_for_delivery"
  | "delivered";

export type ClaimType =
  | "quality"
  | "quantity"
  | "damage"
  | "late_delivery"
  | "other";

export type ClaimStatus = "open" | "under_review" | "resolved" | "rejected";

export type RefundStatus =
  | "not_refunded"
  | "pending"
  | "partial"
  | "full"
  | "complete"
  | "failed";

export interface Profile {
  id: string;
  role: UserRole;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  stripe_customer_id: string | null;
  stripe_connect_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Hub {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  capacity_kg: number;
  used_capacity_kg: number;
  is_active: boolean;
  featured_lot_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lot {
  id: string;
  seller_id: string;
  hub_id: string | null;
  title: string;
  origin_country: string;
  region: string | null;
  farm: string | null;
  variety: string | null;
  process: string | null;
  altitude_min: number | null;
  altitude_max: number | null;
  crop_year: string | null;
  score: number | null;
  description: string | null;
  total_quantity_kg: number;
  committed_quantity_kg: number;
  min_commitment_kg: number;
  bag_size_kg: number | null;
  min_bags_to_succeed: number;
  price_per_kg: number;
  currency: string;
  status: LotStatus;
  commitment_deadline: string | null;
  expiry_date: string | null;
  settlement_status: LotSettlementStatus;
  settlement_processed_at: string | null;
  images: string[];
  flavor_notes: string[];
  certifications: string[];
  created_at: string;
  updated_at: string;
  // Joined fields
  seller?: Profile;
  hub?: Hub;
  commitments?: Commitment[];
  pricing_tiers?: PricingTier[];
}

export interface Commitment {
  id: string;
  lot_id: string;
  buyer_id: string;
  hub_id: string | null;
  campaign_id: string | null;
  quantity_kg: number;
  price_per_kg: number;
  total_price: number;
  status: CommitmentStatus;
  payment_status: CommitmentPaymentStatus;
  charge_amount_cents: number | null;
  charge_currency: string | null;
  stripe_checkout_session_id: string | null;
  stripe_setup_intent_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  payment_error: string | null;
  charged_at: string | null;
  notes: string | null;
  picked_up_at: string | null;
  picked_up_by: string | null;
  kg_locked_at_settlement: number | null;
  kg_refunded_at_settlement: number | null;
  /**
   * AC10 post-settlement email idempotency stamp (Task 4.13).
   * NULL means the buyer has not yet received the campaign-settled summary
   * email for this commitment. See migration #41 + lib/settlement-email-trigger.ts.
   */
  settlement_email_sent_at: string | null;
  refund_status: RefundStatus;
  refunded_amount_cents: number;
  refunded_at: string | null;
  refunded_by: string | null;
  last_refund_id: string | null;
  refund_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  lot?: Lot;
  buyer?: Profile;
}

export interface SampleRequest {
  id: string;
  lot_id: string;
  buyer_id: string;
  hub_id: string | null;
  quantity_grams: number;
  shipping_address: string | null;
  status: SampleStatus;
  tracking_number: string | null;
  cupping_scheduled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  lot?: Lot;
  buyer?: Profile;
  hub?: Hub;
}

export interface Shipment {
  id: string;
  lot_id: string;
  hub_id: string | null;
  origin_address: string | null;
  destination_address: string | null;
  carrier: string | null;
  tracking_number: string | null;
  status: ShipmentStatus;
  shipped_at: string | null;
  delivered_at: string | null;
  weight_kg: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  lot?: Lot;
  hub?: Hub;
}

export interface Claim {
  id: string;
  commitment_id: string;
  filed_by: string;
  hub_id: string | null;
  type: ClaimType;
  description: string;
  evidence_urls: string[];
  status: ClaimStatus;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  commitment?: Commitment;
  filer?: Profile;
}

export interface PricingTier {
  id: string;
  lot_id: string;
  /**
   * Legacy weight threshold in kg. Nullable post-migration #37 — bag-aware
   * tiers store their threshold in `min_bags` and leave this null.
   */
  min_quantity_kg: number | null;
  /**
   * Bag count threshold. Non-null for bag-aware tiers; null for legacy
   * unconverted tiers (which still key on `min_quantity_kg`).
   */
  min_bags: number | null;
  price_per_kg: number;
  created_at: string;
}

export type BagAssignmentResult = {
  commitment_id: string;
  locked_kg: number;
  filling_kg: number;
};

export type HubAccessRequestStatus = "pending" | "approved" | "denied" | "cancelled";

export interface HubAccessRequest {
  id: string;
  hub_id: string;
  user_id: string;
  status: HubAccessRequestStatus;
  created_at: string;
  updated_at: string;
  // Joined fields
  hub?: Hub;
  user?: Profile;
}

export type HubMemberRole = "buyer" | "seller";
export type HubMemberStatus = "invited" | "active" | "removed";

export interface HubLot {
  id: string;
  hub_id: string;
  lot_id: string;
  added_at: string;
  // Joined fields
  lot?: Lot;
}

export interface Campaign {
  id: string;
  lot_id: string;
  hub_id: string;
  deadline: string;
  status: CampaignStatus;
  created_at: string;
  settled_at: string | null;
  // Joined fields
  lot?: Lot;
  hub?: Hub;
}

export interface HubMember {
  id: string;
  hub_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: HubMemberRole;
  status: HubMemberStatus;
  joined_at: string;
  // Joined fields
  user?: Profile;
}
