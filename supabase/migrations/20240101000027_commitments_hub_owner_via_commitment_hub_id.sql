-- Resolve hub-owner authority on commitments via commitments.hub_id directly,
-- not via the lots → hubs join. lots.hub_id is unreliable (frequently NULL —
-- it's only populated on lot creation when the seller picks a hub, but a lot
-- can be campaigned at multiple hubs over its lifetime). The canonical
-- per-cycle hub lives on commitments.hub_id (set when the commit is placed
-- against a campaign at that hub).
--
-- Symptom this fixes: a hub owner gets 403 trying to PATCH a commitment
-- (e.g. mark as picked up) on a lot whose lots.hub_id happens to be NULL.

drop policy if exists "commitments_select_hub_owner" on public.commitments;
create policy "commitments_select_hub_owner"
  on public.commitments for select
  using (
    auth.uid() in (
      select h.owner_id
      from public.hubs h
      where h.id = commitments.hub_id
    )
  );

drop policy if exists "commitments_update_hub_owner" on public.commitments;
create policy "commitments_update_hub_owner"
  on public.commitments for update
  using (
    auth.uid() in (
      select h.owner_id
      from public.hubs h
      where h.id = commitments.hub_id
    )
  );
