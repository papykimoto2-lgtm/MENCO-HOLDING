-- Foncier — lot L16 : enquêtes, bornages, oppositions rattachés au dossier (source unique : parcelle du dossier).
-- Idempotent. Exécuter sur chaque projet Supabase. Prérequis : l1, l3.

-- 1. Rattrapage : dossier unique non annulé de la parcelle.
do $$
declare t text;
begin
  foreach t in array array['pi_enquetes_fonciers','pi_oppositions_fonciers','pi_bornages_fonciers'] loop
    execute format($f$
      update public.%I x set data = x.data || jsonb_build_object('dossier_id', d.id)
        from (select data->>'parcelle_id' pid, min(id) id, count(*) n
                from public.pi_dossiers_fonciers
               where coalesce(data->>'statut','') <> 'annule' group by 1) d
       where coalesce(x.data->>'dossier_id','') = '' and d.pid = x.data->>'parcelle_id' and d.n = 1$f$, t);
  end loop;
end$$;

-- 2. Cohérence : parcelle de la fiche = parcelle du dossier (forcée à l'écriture).
create or replace function public.pi_foncier_fiche_dossier() returns trigger
language plpgsql set search_path = public as $$
declare pid text;
begin
  if coalesce(new.data->>'dossier_id','') = '' then
    if tg_op = 'INSERT' then raise exception 'dossier_id obligatoire' using errcode = '23514'; end if;
    return new; -- anciennes fiches non rattachées : modifiables jusqu'au rattrapage manuel
  end if;
  select data->>'parcelle_id' into pid from public.pi_dossiers_fonciers where id = new.data->>'dossier_id';
  if pid is null then raise exception 'dossier introuvable ou sans parcelle' using errcode = '23503'; end if;
  new.data = new.data || jsonb_build_object('parcelle_id', pid);
  return new;
end$$;

do $$
declare t text;
begin
  foreach t in array array['pi_enquetes_fonciers','pi_oppositions_fonciers','pi_bornages_fonciers'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_dossier', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.pi_foncier_fiche_dossier()', t||'_dossier', t);
  end loop;
end$$;

-- 3. Contrôle : fiches encore non rattachées (à traiter dans l'ERP).
select 'enquetes' k, count(*) from public.pi_enquetes_fonciers where coalesce(data->>'dossier_id','')=''
union all select 'oppositions', count(*) from public.pi_oppositions_fonciers where coalesce(data->>'dossier_id','')=''
union all select 'bornages', count(*) from public.pi_bornages_fonciers where coalesce(data->>'dossier_id','')='';
-- RETOUR : drop trigger pi_*_dossier ; drop function public.pi_foncier_fiche_dossier();
