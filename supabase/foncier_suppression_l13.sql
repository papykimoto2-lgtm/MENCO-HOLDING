-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier — garde-fou de suppression (lot L13)
-- À exécuter sur CHAQUE projet Supabase APRÈS foncier_urbain_rural_l3.sql, _l5.sql, foncier_audit_l8.sql, foncier_documents_l10.sql
-- et foncier_coherence_l12.sql (les tables absentes sont ignorées). Idempotent.
-- Même règle que le client : on ne supprime pas ce qui est signé, clos, jugé, encaissé ou décidé. Une suppression légitime se fait dans l'ERP
-- (administrateur, motif, trace) ; ce garde-fou protège contre un appel direct à l'API.
-- Cas d'un nettoyage volontaire (jeu de test) : set session_replication_role = replica; (rôle propriétaire uniquement).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.fonc_suppression_garde() returns trigger language plpgsql set search_path = '' as $$
declare d jsonb := old.data; motif text;
begin
  motif := case tg_table_name
    when 'pi_protocoles_purge_fonciers' then case when d ->> 'statut' in ('signe', 'reitere') then 'protocole signé' end
    when 'pi_pv_remises_fonciers' then case when d ->> 'statut' = 'signe' then 'procès-verbal signé' end
    when 'pi_enquetes_fonciers' then case when d ->> 'statut' = 'cloturee' then 'enquête clôturée' end
    when 'pi_oppositions_fonciers' then case when d ->> 'statut' in ('levee', 'rejetee', 'jugee') then 'opposition traitée' end
    when 'pi_bornages_fonciers' then case when d ->> 'statut' = 'realise' then 'bornage réalisé' end
    when 'pi_charges_fonciers' then case when d ->> 'statut' = 'levee' then 'charge levée' end
    when 'pi_proprietaires_fonciers' then case when coalesce(d ->> 'date_fin', '') <> '' then 'propriétaire sorti de la chaîne de propriété' end
    when 'pi_audits_fonciers' then case when coalesce(d ->> 'decision', 'en_attente') not in ('', 'en_attente') then 'audit décidé' end
    when 'pi_contrats_fonciers' then case when d ->> 'statut' = 'resilie' then 'contrat résilié'
      when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(d -> 'echeances') = 'array' then d -> 'echeances' else '[]'::jsonb end) e where e ->> 'statut' = 'paye') then 'échéance encaissée' end
    when 'pi_constats_coherence_fonciers' then 'constat conservé pour la traçabilité'
  end;
  if motif is not null then
    raise exception 'Suppression refusée (%) : %', coalesce(d ->> 'reference', old.id), motif using errcode = '23514';
  end if;
  return old;
end$$;
revoke all on function public.fonc_suppression_garde() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['pi_protocoles_purge_fonciers', 'pi_pv_remises_fonciers', 'pi_enquetes_fonciers', 'pi_oppositions_fonciers', 'pi_bornages_fonciers',
                           'pi_charges_fonciers', 'pi_proprietaires_fonciers', 'pi_audits_fonciers', 'pi_contrats_fonciers', 'pi_constats_coherence_fonciers']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_suppr_garde', t);
      execute format('create trigger %I before delete on public.%I for each row execute function public.fonc_suppression_garde()', t || '_suppr_garde', t);
    end if;
  end loop;
end$$;

select c.relname as table_protegee from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname like '%\_suppr\_garde' order by 1;

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. delete d'un protocole signé, PV signé, enquête clôturée, opposition levée, bornage réalisé, charge levée, propriétaire sorti,
--     audit décidé, contrat résilié ou encaissé, constat de cohérence → refus (23514).
--  2. delete d'un brouillon, d'une enquête planifiée, d'une opposition ouverte, d'un contrat sans paiement → accepté.
-- ── RETOUR ARRIÈRE : drop trigger <table>_suppr_garde on public.<table> ; drop function public.fonc_suppression_garde();
