-- 017_campaigns_public_read.sql
-- Fix two RLS gaps introduced by the exclusive lot campaigns feature:
--
-- 1. campaigns: No policy existed for anonymous users or cross-hub reads.
--    This broke the public /browse page (anon → empty results) and the hub
--    catalog page (hub owners could only see their own hub's active campaigns,
--    so claimed lots appeared available to other hubs).
--
-- 2. commitments: No policy existed for anonymous users, so the public lot
--    detail page (/browse/[id]) showed an empty backers list.
--
-- Active campaigns are public information — a lot being actively marketed to
-- buyers is not sensitive. We only expose status = 'active' rows.

-- Allow anyone (including unauthenticated visitors) to read active campaigns.
create policy "campaigns_select_active_public"
  on public.campaigns for select
  using (status = 'active');

-- Allow anyone to read commitments on lots that have an active campaign.
-- This enables the public lot detail page to show backer progress.
create policy "commitments_select_public_campaign_lot"
  on public.commitments for select
  using (
    exists (
      select 1 from public.campaigns
      where lot_id = commitments.lot_id
        and status = 'active'
    )
  );
