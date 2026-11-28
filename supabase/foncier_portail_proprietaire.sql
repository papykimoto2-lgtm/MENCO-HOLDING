-- ═══════════════════════════════════════════════════════════════════════════
-- Portail propriétaire terrien : vue serveur fc_vue_proprietaire()
-- À exécuter sur le projet MENCO (et sur tout projet utilisant le portail propriétaire). Idempotent.
--
-- Problème corrigé : le portail lisait « pi_af_operations?select=id,data » en entier puis filtrait dans le
-- navigateur. Une opération contient TOUS ses propriétaires (contacts, CNI, empreintes de codes d'accès),
-- les financiers, les prix et les budgets. Même après fermeture des politiques ouvertes, la politique
-- « portail_operations » donnait la ligne entière au propriétaire concerné.
--
-- Cette fonction (SECURITY DEFINER) renvoie UNIQUEMENT ce que l'écran affiche :
--   · l'identité du propriétaire connecté (nom, qualité, contact) ;
--   · par site : nom, localisation, superficie, étape, nombre de lots, quota du collège, jalons juridiques,
--     postes de travaux (libellé + avancement), démarches (libellé, statut, date), avancement pondéré.
-- Jamais : autres propriétaires, empreintes ou sels, financiers, prix, budgets, observations, pièces.
--
-- Identité : lue UNIQUEMENT dans le jeton émis par portal-login (kind = 'proprio_foncier', claim prop_id).
-- Aucun paramètre : impossible de demander les données d'un autre (IDOR). Sans jeton propriétaire : vide.
-- Fiches supprimées (suppression logique ou pierre tombale) : exclues.
--
-- NB Dashboard Supabase : pas de « select … into variable » (il l'interprète comme une création de table) :
-- affectations « v := (select …) ». Coller le fichier ENTIER.
-- Retour arrière : voir la fin du fichier.
-- ═══════════════════════════════════════════════════════════════════════════

-- Nombre tolérant : « 12 », « 12.5 », « 12,5 », « 12 % » ; sinon 0. Jamais d'erreur de conversion.
create or replace function public.fc_nombre_sur(t text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when replace(regexp_replace(coalesce(t, ''), '[^0-9,.\-]', '', 'g'), ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then replace(regexp_replace(t, '[^0-9,.\-]', '', 'g'), ',', '.')::numeric
              else 0 end
$$;

create or replace function public.fc_vue_proprietaire()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_prop jsonb;
  v_id   text := coalesce(nullif(auth.jwt() ->> 'prop_id', ''), nullif(auth.jwt() ->> 'scope_id', ''), '');
  v_moi  jsonb;
  v_ops  jsonb;
begin
  if coalesce(auth.jwt() ->> 'kind', '') <> 'proprio_foncier' or v_id = '' then
    return jsonb_build_object('moi', null, 'sites', '[]'::jsonb);
  end if;

  -- Opérations où figure ce propriétaire (élément non supprimé), hors fiches supprimées.
  v_ops := (
    select coalesce(jsonb_agg(s.site order by s.site ->> 'nom'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id',          o.id,
        'nom',         o.data ->> 'nom',
        'village',     o.data ->> 'village',
        'commune',     o.data ->> 'commune',
        'departement', o.data ->> 'departement',
        'superficie',  public.fc_nombre_sur(o.data ->> 'superficie'),
        'stage',       o.data ->> 'stage',
        'nb_lots',     public.fc_nombre_sur(o.data ->> 'nb_lots'),
        'cle_prop',    public.fc_nombre_sur(o.data -> 'cle' ->> 'prop'),
        'accord_principe',   coalesce(o.data ->> 'accord_principe', '') not in ('', 'false', '0', 'null'),
        'verif_droits',      coalesce(o.data ->> 'verif_droits', '') not in ('', 'false', '0', 'null'),
        'juridique_valide',  coalesce(o.data ->> 'juridique_valide', '') not in ('', 'false', '0', 'null'),
        'postes', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'poste', coalesce(nullif(v ->> 'poste', ''), nullif(v ->> 'nom', ''), 'Poste'),
                   'avancement', least(100, greatest(0, public.fc_nombre_sur(v ->> 'avancement')))) order by ord), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(o.data -> 'postes_vrd') = 'array' then o.data -> 'postes_vrd' else '[]'::jsonb end)
               with ordinality as t(v, ord)),
        -- Avancement pondéré par les budgets (calculé ici : le budget lui-même n'est jamais renvoyé).
        'avancement', (
          select case
                   when count(*) = 0 then 0
                   when sum(public.fc_nombre_sur(v ->> 'budget')) > 0
                     then round(sum(public.fc_nombre_sur(v ->> 'budget') * least(100, greatest(0, public.fc_nombre_sur(v ->> 'avancement'))))
                                / sum(public.fc_nombre_sur(v ->> 'budget')))
                   else round(avg(least(100, greatest(0, public.fc_nombre_sur(v ->> 'avancement')))))
                 end
          from jsonb_array_elements(case when jsonb_typeof(o.data -> 'postes_vrd') = 'array' then o.data -> 'postes_vrd' else '[]'::jsonb end) as t(v)),
        'demarches', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'libelle', coalesce(nullif(d ->> 'libelle', ''), nullif(d ->> 'type', ''), '—'),
                   'statut',  coalesce(nullif(d ->> 'statut', ''), 'en cours'),
                   'date',    d ->> 'date') order by ord), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(o.data -> 'demarches') = 'array' then o.data -> 'demarches' else '[]'::jsonb end)
               with ordinality as t(d, ord))
      ) as site
      from public.pi_af_operations o
      where coalesce(o.data ->> '_deleted', '') <> 'true'
        and not exists (select 1 from public.pi_suppressions s where s.id = 'ts::af_operations::' || o.id)
        and exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(o.data -> 'proprietaires') = 'array' then o.data -> 'proprietaires' else '[]'::jsonb end) p
          where p ->> 'id' = v_id and coalesce(p ->> '_deleted', '') <> 'true')
    ) s);

  v_moi := (
    select jsonb_build_object('id', p ->> 'id', 'nom', p ->> 'nom', 'qualite', p ->> 'qualite', 'contact', p ->> 'contact')
    from public.pi_af_operations o,
         jsonb_array_elements(case when jsonb_typeof(o.data -> 'proprietaires') = 'array' then o.data -> 'proprietaires' else '[]'::jsonb end) p
    where p ->> 'id' = v_id and coalesce(p ->> '_deleted', '') <> 'true'
      and coalesce(o.data ->> '_deleted', '') <> 'true'
    limit 1);

  return jsonb_build_object('moi', v_moi, 'sites', v_ops);
end
$fn$;

revoke all on function public.fc_vue_proprietaire() from public, anon;
grant execute on function public.fc_vue_proprietaire() to authenticated;
revoke all on function public.fc_nombre_sur(text) from public, anon;

-- La politique de lecture du portail ne donne plus la ligne entière au propriétaire : il passe par la fonction.
-- (Les accès financier et cession sont conservés.) Sans effet visible tant que les politiques ouvertes
-- « *_open_rollback » existent : elle prépare leur fermeture.
drop policy if exists portail_operations on public.pi_af_operations;
create policy portail_operations on public.pi_af_operations for select to authenticated
  using ((id = any (portail_rls.cession_operation_ids())) or (id = any (portail_rls.financier_operation_ids())));

-- ── Retour arrière ─────────────────────────────────────────────────────────
-- drop policy if exists portail_operations on public.pi_af_operations;
-- create policy portail_operations on public.pi_af_operations for select to authenticated
--   using (portail_rls.proprio_dans((data -> 'proprietaires'::text)) or (id = any (portail_rls.cession_operation_ids())) or (id = any (portail_rls.financier_operation_ids())));
-- drop function if exists public.fc_vue_proprietaire();
-- drop function if exists public.fc_nombre_sur(text);
