-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier — correctifs de la revue générale (lot L15) : serveur
-- À exécuter sur CHAQUE projet Supabase APRÈS les scripts foncier_* précédents (L1 à L13, foncier_chevauchement_postgis.sql). Idempotent.
-- Corrige :
--  A. CHECK qui passent sur NULL : une clé de statut / type absente contournait les règles. Champs obligatoires ajoutés (NOT VALID :
--     contrôlés à chaque écriture, sans refuser les lignes historiques).
--  B. Protocole signé déverrouillable en supprimant la clé « statut » (garde du protocole).
--  C. Retour en arrière interdit sur les états clos (charge levée, enquête clôturée, opposition traitée, bornage réalisé,
--     propriétaire sorti, contrat résilié / échéance encaissée, décision d'un constat) : le garde de suppression L13 n'est plus contournable
--     en deux étapes.
--  D. Régime d'une parcelle : un upsert d'un poste sans le champ ne remplace plus le régime existant.
--  E. Contours : un upsert (INSERT … ON CONFLICT) sur une ligne existante ne touche plus la table des contours : le contrôle se fait à la
--     phase UPDATE, après le garde « dernier écrit gagne ».
-- Hors de ce script : foncier_echeances_serveur.sql (conversions sûres du cycle d'alertes) et foncier_audit_l8.sql (index) sont à rejouer.
-- Limite assumée : la RLS accepte tout rôle applicatif ; les règles « administrateur » (dérogation, modification d'un enregistrement clos,
-- suppression) sont appliquées par l'ERP. Le serveur empêche les contournements structurels (A à E), pas l'usurpation de rôle.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. Champs obligatoires ─────────────────────────────────────────────────
do $$
declare r record; expr text;
begin
  for r in select * from (values
      ('pi_enquetes_fonciers',        array['statut']),
      ('pi_oppositions_fonciers',     array['statut']),
      ('pi_bornages_fonciers',        array['statut']),
      ('pi_titres_fonciers',          array['type', 'regime']),
      ('pi_charges_fonciers',         array['type', 'statut']),
      ('pi_exploitations_fonciers',   array['statut']),
      ('pi_contrats_fonciers',        array['type', 'statut', 'periodicite']),
      ('pi_protocoles_purge_fonciers', array['statut']),
      ('pi_pv_remises_fonciers',      array['type', 'statut']),
      ('pi_constats_coherence_fonciers', array['niveau', 'statut'])) as t(nom, cles)
  loop
    if to_regclass('public.' || r.nom) is null then continue; end if;
    select string_agg(format('coalesce(data ->> %L, '''') <> ''''', k), ' and ') into expr from unnest(r.cles) k;
    execute format('alter table public.%I drop constraint if exists %I', r.nom, r.nom || '_requis_chk');
    execute format('alter table public.%I add constraint %I check (%s) not valid', r.nom, r.nom || '_requis_chk', expr);
  end loop;
end$$;

-- ── B. Protocole de purge : garde sans faille sur statut absent ────────────
create or replace function public.fonc_protocole_garde() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare ok boolean; vieux text := case when tg_op = 'UPDATE' then coalesce(old.data ->> 'statut', '') else '' end; neuf text := coalesce(new.data ->> 'statut', '');
begin
  if vieux in ('signe', 'reitere') then
    -- Après signature : seule la réitération notariée (statut, acte, date) peut évoluer.
    if (new.data - 'statut' - 'acte_notarie' - 'date_reiteration') is distinct from (old.data - 'statut' - 'acte_notarie' - 'date_reiteration')
       or (vieux = 'reitere' and new.data is distinct from old.data)
       or (neuf not in (vieux, 'reitere')) then
      raise exception 'Protocole signé (%) : non modifiable', old.data ->> 'reference' using errcode = '23514';
    end if;
  end if;
  if neuf in ('signe', 'reitere') and length(trim(coalesce(new.data ->> 'derogation_audit', ''))) = 0 and vieux not in ('signe', 'reitere') then
    select exists (
      select 1 from public.pi_audits_fonciers a
       where a.data ->> 'decision' = 'go'
         and ( (coalesce(new.data ->> 'operation_id', '') <> '' and a.data ->> 'operation_id' = new.data ->> 'operation_id')
            or (coalesce(new.data ->> 'parcelle_id', '') <> '' and a.data ->> 'parcelle_id' = new.data ->> 'parcelle_id')
            or exists (select 1 from public.pi_programmes p where p.id = new.data ->> 'programme_id'
                          and coalesce(p.data ->> 'ref_import', '') <> '' and a.data ->> 'code_projet' = p.data ->> 'ref_import') )
    ) into ok;
    if not ok then raise exception 'Protocole : audit foncier pré-acquisition décidé GO requis (ou dérogation motivée)' using errcode = '23514'; end if;
  end if;
  return new;
end$$;
revoke all on function public.fonc_protocole_garde() from public, anon, authenticated;

-- ── C. Pas de retour en arrière sur les états clos ─────────────────────────
create or replace function public.fonc_regression_garde() returns trigger language plpgsql set search_path = '' as $$
declare o jsonb := old.data; n jsonb := new.data; motif text;
  payes_o int; payes_n int;
begin
  motif := case tg_table_name
    when 'pi_charges_fonciers' then case when o ->> 'statut' = 'levee' and coalesce(n ->> 'statut', '') <> 'levee' then 'charge levée' end
    when 'pi_enquetes_fonciers' then case when o ->> 'statut' = 'cloturee' and coalesce(n ->> 'statut', '') <> 'cloturee' then 'enquête clôturée' end
    when 'pi_oppositions_fonciers' then case when o ->> 'statut' in ('levee', 'rejetee', 'jugee') and coalesce(n ->> 'statut', '') not in ('levee', 'rejetee', 'jugee') then 'opposition traitée' end
    when 'pi_bornages_fonciers' then case when o ->> 'statut' = 'realise' and coalesce(n ->> 'statut', '') <> 'realise' then 'bornage réalisé' end
    when 'pi_proprietaires_fonciers' then case when coalesce(o ->> 'date_fin', '') <> '' and coalesce(n ->> 'date_fin', '') = '' then 'propriétaire sorti de la chaîne de propriété' end
    when 'pi_contrats_fonciers' then case when o ->> 'statut' = 'resilie' and coalesce(n ->> 'statut', '') <> 'resilie' then 'contrat résilié' end
    when 'pi_constats_coherence_fonciers' then case when o ->> 'statut' in ('maintenu', 'faux_positif') and n ->> 'statut' = o ->> 'statut' and n -> 'decision' is distinct from o -> 'decision' then 'décision conservée' end
  end;
  if motif is null and tg_table_name = 'pi_contrats_fonciers' then
    select count(*) into payes_o from jsonb_array_elements(case when jsonb_typeof(o -> 'echeances') = 'array' then o -> 'echeances' else '[]'::jsonb end) e where e ->> 'statut' = 'paye';
    select count(*) into payes_n from jsonb_array_elements(case when jsonb_typeof(n -> 'echeances') = 'array' then n -> 'echeances' else '[]'::jsonb end) e where e ->> 'statut' = 'paye';
    if payes_n < payes_o then motif := 'échéance encaissée'; end if;
  end if;
  if motif is not null then
    raise exception 'Retour en arrière refusé (%) : %', coalesce(o ->> 'reference', old.id), motif using errcode = '23514';
  end if;
  return new;
end$$;
revoke all on function public.fonc_regression_garde() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['pi_charges_fonciers', 'pi_enquetes_fonciers', 'pi_oppositions_fonciers', 'pi_bornages_fonciers', 'pi_proprietaires_fonciers', 'pi_contrats_fonciers', 'pi_constats_coherence_fonciers']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_regression_garde', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.fonc_regression_garde()', t || '_regression_garde', t);
    end if;
  end loop;
end$$;

-- ── D. Régime : un upsert sans le champ conserve le régime déjà en base ─────
do $$ begin
  if to_regclass('public.pi_parcelles') is not null then
    execute $f$
      create or replace function public.pi_parcelles_regime_garde()
      returns trigger language plpgsql set search_path = '' as $b$
      declare existant text;
      begin
        if coalesce(new.data ->> 'regime', '') = '' then
          select p.data ->> 'regime' into existant from public.pi_parcelles p where p.id = new.id;
          new.data := new.data || jsonb_build_object('regime',
            case when tg_op = 'UPDATE' and old.data ->> 'regime' in ('urbain', 'rural') then old.data ->> 'regime'
                 when existant in ('urbain', 'rural') then existant
                 else 'urbain' end);
        elsif new.data ->> 'regime' not in ('urbain', 'rural') then
          raise exception 'Régime foncier invalide : % (urbain ou rural)', new.data ->> 'regime' using errcode = '23514';
        end if;
        return new;
      end$b$ $f$;
  end if;
end$$;

-- ── E. Contours : un upsert sur une ligne existante ne touche pas la table des contours ──
do $$
declare src text;
begin
  if to_regprocedure('public.fonc_parcelles_geom_garde()') is not null then
    select pg_get_functiondef('public.fonc_parcelles_geom_garde()'::regprocedure) into src;
    if src not like '%upsert : phase UPDATE%' then
      src := replace(src, E'begin\n  actif :=', E'begin\n  -- upsert : phase UPDATE (lot L15) : une ligne existante est contrôlée à la phase UPDATE, après le garde « dernier écrit gagne ».\n  if tg_op = ''INSERT'' and exists (select 1 from public.pi_parcelles p where p.id = new.id) then return new; end if;\n  actif :=');
      if src like '%upsert : phase UPDATE%' then execute src; else raise warning 'fonc_parcelles_geom_garde : motif non trouvé, correctif E non appliqué'; end if;
    end if;
  end if;
end$$;

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. Charge sans statut, contrat sans type, enquête sans statut → refus (champs obligatoires).
--  2. Protocole signé : « data - 'statut' » → refus ; insertion sans statut → refus.
--  3. Charge levée → active, enquête clôturée → ouverte, opposition levée → ouverte, bornage réalisé → convoqué, propriétaire sans date_fin,
--     contrat résilié → actif, échéance payée → à payer : refus (23514).
--  4. Upsert d'une parcelle rurale sans champ « regime » : le régime rural est conservé.
--  5. Upsert périmé sur une parcelle existante : la table des contours reste celle de la parcelle en base.
-- ── RETOUR ARRIÈRE : drop trigger <table>_regression_garde on <table> ; drop function public.fonc_regression_garde() ;
--                      alter table <table> drop constraint <table>_requis_chk ;
