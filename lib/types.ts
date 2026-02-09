export type UserRole = "buyer" | "seller" | "hub_owner";

export type LotStatus =
  | "draft"
  | "active"
  | "fully_committed"
  | "shipped"
  | "delivered"
  | "closed";

export type CommitmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "shipped"
  | "delivered";

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
  price_per_kg: number;
  currency: string;
  status: LotStatus;
  commitment_deadline: string | null;
  images: string[];
  flavor_notes: string[];
  certifications: string[];
  created_at: string;
  updated_at: string;
  // Joined fields
  seller?: Profile;
  hub?: Hub;
  commitments?: Commitment[];
}

export interface Commitment {
  id: string;
  lot_id: string;
  buyer_id: string;
  quantity_kg: number;
  price_per_kg: number;
  total_price: number;
  status: CommitmentStatus;
  notes: string | null;
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
  quantity_grams: number;
  shipping_address: string | null;
  status: SampleStatus;
  tracking_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  lot?: Lot;
  buyer?: Profile;
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
