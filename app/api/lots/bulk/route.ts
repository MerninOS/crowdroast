import { createClient } from "@/lib/supabase/server";
import { fromDisplayPricePerUnit } from "@/lib/units";
import { sendNewSellerCoffeesEmail } from "@/lib/email";
import { NextResponse } from "next/server";

type CsvLotRow = {
  title?: string;
  origin_country?: string;
  region?: string;
  farm?: string;
  variety?: string;
  process?: string;
  altitude_min?: string;
  altitude_max?: string;
  crop_year?: string;
  score?: string;
  description?: string;
  total_quantity_kg?: string;
  min_commitment_kg?: string;
  price_per_kg?: string;
  price_per_lb?: string;
  commitment_deadline?: string;
  flavor_notes?: string;
  certifications?: string;
  currency?: string;
};

function parseOptionalNumber(value?: string) {
  if (!value?.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseOptionalInteger(value?: string) {
  if (!value?.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseList(value?: string) {
  return value
    ? value
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const rows = Array.isArray(body?.rows) ? (body.rows as CsvLotRow[]) : [];

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "At least one CSV row is required." },
      { status: 400 }
    );
  }

  const preparedRows: Array<Record<string, unknown>> = [];
  const errors: Array<{ row: number; message: string }> = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const title = row.title?.trim() || "";
    const originCountry = row.origin_country?.trim() || "";
    const totalQuantityKg = parseOptionalNumber(row.total_quantity_kg);
    const minCommitmentKg = parseOptionalNumber(row.min_commitment_kg);
    const rawPricePerKg = parseOptionalNumber(row.price_per_kg);
    const rawPricePerLb = parseOptionalNumber(row.price_per_lb);
    const hasKgPrice = Number.isFinite(rawPricePerKg) && Number(rawPricePerKg) > 0;
    const hasLbPrice = Number.isFinite(rawPricePerLb) && Number(rawPricePerLb) > 0;
    const pricePerKg = hasKgPrice
      ? Number(rawPricePerKg)
      : hasLbPrice
        ? fromDisplayPricePerUnit(Number(rawPricePerLb), "lb")
        : null;

    if (!title) {
      errors.push({ row: rowNumber, message: "title is required." });
    }
    if (!originCountry) {
      errors.push({ row: rowNumber, message: "origin_country is required." });
    }
    if (!Number.isFinite(totalQuantityKg) || Number(totalQuantityKg) <= 0) {
      errors.push({
        row: rowNumber,
        message: "total_quantity_kg must be a positive number.",
      });
    }
    if (!Number.isFinite(minCommitmentKg) || Number(minCommitmentKg) <= 0) {
      errors.push({
        row: rowNumber,
        message: "min_commitment_kg must be a positive number.",
      });
    }
    if (
      Number.isFinite(totalQuantityKg) &&
      Number.isFinite(minCommitmentKg) &&
      Number(minCommitmentKg) > Number(totalQuantityKg)
    ) {
      errors.push({
        row: rowNumber,
        message: "min_commitment_kg cannot be greater than total_quantity_kg.",
      });
    }
    if (
      rawPricePerKg !== null &&
      (!Number.isFinite(rawPricePerKg) || Number(rawPricePerKg) <= 0)
    ) {
      errors.push({
        row: rowNumber,
        message: "price_per_kg must be a positive number when provided.",
      });
    }
    if (
      rawPricePerLb !== null &&
      (!Number.isFinite(rawPricePerLb) || Number(rawPricePerLb) <= 0)
    ) {
      errors.push({
        row: rowNumber,
        message: "price_per_lb must be a positive number when provided.",
      });
    }
    if (!hasKgPrice && !hasLbPrice) {
      errors.push({
        row: rowNumber,
        message: "Provide either price_per_kg or price_per_lb.",
      });
    }

    const deadlineValue = row.commitment_deadline?.trim() || "";
    const deadline = deadlineValue ? new Date(deadlineValue) : null;
    if (!deadline || Number.isNaN(deadline.getTime())) {
      errors.push({
        row: rowNumber,
        message: "commitment_deadline must be a valid date/time.",
      });
    }

    const score = parseOptionalNumber(row.score);
    if (Number.isNaN(score)) {
      errors.push({ row: rowNumber, message: "score must be numeric when provided." });
    }

    const altitudeMin = parseOptionalInteger(row.altitude_min);
    if (Number.isNaN(altitudeMin)) {
      errors.push({
        row: rowNumber,
        message: "altitude_min must be a whole number when provided.",
      });
    }

    const altitudeMax = parseOptionalInteger(row.altitude_max);
    if (Number.isNaN(altitudeMax)) {
      errors.push({
        row: rowNumber,
        message: "altitude_max must be a whole number when provided.",
      });
    }

    if (
      Number.isFinite(altitudeMin) &&
      Number.isFinite(altitudeMax) &&
      Number(altitudeMin) > Number(altitudeMax)
    ) {
      errors.push({
        row: rowNumber,
        message: "altitude_min cannot be greater than altitude_max.",
      });
    }

    if (errors.some((error) => error.row === rowNumber)) {
      return;
    }

    preparedRows.push({
      seller_id: user.id,
      title,
      origin_country: originCountry,
      region: row.region?.trim() || null,
      farm: row.farm?.trim() || null,
      variety: row.variety?.trim() || null,
      process: row.process?.trim() || null,
      altitude_min: altitudeMin ?? null,
      altitude_max: altitudeMax ?? null,
      crop_year: row.crop_year?.trim() || null,
      score: score ?? null,
      description: row.description?.trim() || null,
      total_quantity_kg: Number(totalQuantityKg),
      min_commitment_kg: Number(minCommitmentKg),
      price_per_kg: Number(pricePerKg),
      commitment_deadline: deadline!.toISOString(),
      flavor_notes: parseList(row.flavor_notes),
      certifications: parseList(row.certifications),
      currency: row.currency?.trim().toUpperCase() || "USD",
      status: "draft",
      images: [],
    });
  });

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lots")
    .insert(preparedRows)
    .select("id, title, origin_country, price_per_kg, currency");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // AC-4: notify hub owners who have an existing relationship with this seller
  if (data && data.length > 0) {
    // Fetch all lot IDs by this seller to find historical hub connections
    const { data: allSellerLots } = await supabase
      .from("lots")
      .select("id")
      .eq("seller_id", user.id);

    const sellerLotIds = (allSellerLots || []).map((l) => l.id);

    if (sellerLotIds.length > 0) {
      const connectedOwnerIds = new Set<string>();

      // Path 1: hub owners who added seller's lots to their catalogs
      const { data: hubLotsData } = await supabase
        .from("hub_lots")
        .select("hub_id")
        .in("lot_id", sellerLotIds);

      if (hubLotsData?.length) {
        const hubIds = [...new Set(hubLotsData.map((hl) => hl.hub_id))];
        const { data: hubs } = await supabase
          .from("hubs")
          .select("owner_id")
          .in("id", hubIds);
        hubs?.forEach((h) => connectedOwnerIds.add(h.owner_id));
      }

      // Path 2: hub owners who requested samples from seller's lots
      const { data: sampleData } = await supabase
        .from("sample_requests")
        .select("buyer_id")
        .in("lot_id", sellerLotIds);
      sampleData?.forEach((sr) => connectedOwnerIds.add(sr.buyer_id));

      if (connectedOwnerIds.size > 0) {
        const { data: sellerProfile } = await supabase
          .from("profiles")
          .select("contact_name, company_name")
          .eq("id", user.id)
          .single();

        const sellerName =
          sellerProfile?.company_name ||
          sellerProfile?.contact_name ||
          "A seller";

        const newLots = data.map((l) => ({
          title: l.title,
          originCountry: l.origin_country,
          pricePerKg: l.price_per_kg,
          currency: (l.currency as string) || "USD",
        }));

        const { data: ownerProfiles } = await supabase
          .from("profiles")
          .select("email, contact_name")
          .in("id", [...connectedOwnerIds]);

        const emailPromises = (ownerProfiles || []).map((owner) =>
          sendNewSellerCoffeesEmail({
            hubOwner: owner,
            sellerName,
            newLots,
          }).catch(console.error)
        );

        await Promise.allSettled(emailPromises);
      }
    }
  }

  return NextResponse.json({
    created: data?.length || 0,
    lots: data || [],
  });
}
