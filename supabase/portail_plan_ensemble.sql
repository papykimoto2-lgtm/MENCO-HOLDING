-- ═══════════════════════════════════════════════════════════════════════════
-- Portail souscripteur : plan d'ensemble (plan directeur) du programme.
-- À exécuter sur le projet Supabase de MENCO (et de tout projet utilisant le portail). Idempotent.
--
-- Principes
--   · Rien n'est visible tant que la direction n'a pas PUBLIÉ : la publication fige une copie (data -> 'pub') ;
--     modifier le brouillon ensuite ne change rien au portail avant une nouvelle publication.
--   · Le statut juridique du plan est affiché au souscripteur, avec une mention qui ne peut pas être retirée :
--     projet MENKO (indicatif, non approuvé) | déposé à l'urbanisme (en instruction) | approuvé par arrêté (référence obligatoire).
--   · Les phases futures sont toujours présentées comme PRÉVISIONNELLES et sans engagement.
--   · Le souscripteur ne voit que les plans des programmes de SES lots (identité lue dans le jeton, aucun paramètre libre
--     pour la liste ; l'image est demandée par identifiant de plan et re-contrôlée contre ses programmes : pas d'IDOR).
--   · Jamais renvoyés : remarques internes, auteur, historique.
-- Table au format ERP : id / data jsonb / updated_at / scope_id. RLS forcée, accès personnel seulement (pas d'anon).
-- Retour arrière : voir la fin du fichier.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pi_plans_ensemble (
  id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), scope_id text);
alter table public.pi_plans_ensemble enable row level security;
alter table public.pi_plans_ensemble force row level security;
revoke all on table public.pi_plans_ensemble from anon;
revoke all on table public.pi_plans_ensemble from public;
drop policy if exists pi_plans_ensemble_staff on public.pi_plans_ensemble;
create policy pi_plans_ensemble_staff on public.pi_plans_ensemble for all to authenticated
  using ((auth.jwt() ->> 'app_role') is not null) with check ((auth.jwt() ->> 'app_role') is not null);
revoke all on table public.pi_plans_ensemble from authenticated;
grant select, insert, update, delete on table public.pi_plans_ensemble to authenticated;
drop trigger if exists pi_plans_ensemble_touch on public.pi_plans_ensemble;
create trigger pi_plans_ensemble_touch before update on public.pi_plans_ensemble for each row execute function public.pi_foncier_touch();

alter table public.pi_plans_ensemble drop constraint if exists pi_plans_ensemble_statut_chk;
alter table public.pi_plans_ensemble add constraint pi_plans_ensemble_statut_chk
  check (coalesce(data ->> 'statut_plan', 'projet') in ('projet', 'depose', 'approuve'));
-- Un plan « approuvé » exige la référence de l'acte d'approbation.
alter table public.pi_plans_ensemble drop constraint if exists pi_plans_ensemble_acte_chk;
alter table public.pi_plans_ensemble add constraint pi_plans_ensemble_acte_chk
  check (coalesce(data ->> 'statut_plan', 'projet') <> 'approuve' or length(trim(coalesce(data ->> 'reference_acte', ''))) > 0);
create index if not exists pi_plans_ensemble_prog on public.pi_plans_ensemble ((data ->> 'programme_id'));

-- Programmes des lots du souscripteur connecté (jeton uniquement).
create or replace function public.fc_programmes_souscripteur()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
  v_client_id text := auth.jwt() ->> 'client_id';
  v_client    jsonb;
  v_lot_ids   text[];
begin
  if coalesce(auth.jwt() ->> 'kind', '') <> 'souscripteur' or coalesce(v_client_id, '') = '' then return '{}'::text[]; end if;
  v_client := (select data from public.pi_clients where id = v_client_id);
  if v_client is null then return '{}'::text[]; end if;
  if jsonb_typeof(v_client -> 'lot_ids') = 'array' and jsonb_array_length(v_client -> 'lot_ids') > 0 then
    v_lot_ids := (select array_agg(x) from jsonb_array_elements_text(v_client -> 'lot_ids') x);
  elsif coalesce(v_client ->> 'lot_id', '') <> '' then
    v_lot_ids := array[v_client ->> 'lot_id'];
  else
    return '{}'::text[];
  end if;
  return coalesce((select array_agg(distinct l.data ->> 'programme_id') from public.pi_lots l
                    where l.id = any (v_lot_ids) and coalesce(l.data ->> 'programme_id', '') <> ''), '{}'::text[]);
end
$f$;
revoke all on function public.fc_programmes_souscripteur() from public, anon;

-- Liste : plans PUBLIÉS des programmes du souscripteur (sans l'image).
create or replace function public.fc_vue_plan_ensemble()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
  v_progs text[] := public.fc_programmes_souscripteur();
begin
  if coalesce(array_length(v_progs, 1), 0) = 0 then return jsonb_build_object('plans', '[]'::jsonb); end if;
  return jsonb_build_object('plans', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'programme', coalesce((select pg.data ->> 'nom' from public.pi_programmes pg where pg.id = p.data ->> 'programme_id'), ''),
             'titre', p.data -> 'pub' ->> 'titre',
             'version', p.data -> 'pub' ->> 'version',
             'date_plan', p.data -> 'pub' ->> 'date_plan',
             'statut_plan', coalesce(p.data -> 'pub' ->> 'statut_plan', 'projet'),
             'reference_acte', p.data -> 'pub' ->> 'reference_acte',
             'phases', case when jsonb_typeof(p.data -> 'pub' -> 'phases') = 'array' then p.data -> 'pub' -> 'phases' else '[]'::jsonb end,
             'a_image', coalesce(p.data -> 'pub' ->> 'image', '') ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$',
             'publie_le', p.data -> 'pub' ->> 'le') order by p.data -> 'pub' ->> 'le' desc)
    from public.pi_plans_ensemble p
    where coalesce(p.data ->> 'publie', '') = 'true'
      and jsonb_typeof(p.data -> 'pub') = 'object'
      and coalesce(p.data ->> '_deleted', '') <> 'true'
      and (p.data ->> 'programme_id') = any (v_progs)
      and not exists (select 1 from public.pi_suppressions s where s.id = 'ts::plans_ensemble::' || p.id)), '[]'::jsonb));
end
$f$;
revoke all on function public.fc_vue_plan_ensemble() from public, anon;
grant execute on function public.fc_vue_plan_ensemble() to authenticated;

-- Image d'UN plan publié (demandée à l'ouverture), contrôlée contre les programmes du souscripteur.
create or replace function public.fc_vue_plan_ensemble_image(p_plan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
  v_progs text[] := public.fc_programmes_souscripteur();
  v_img   text;
begin
  if coalesce(array_length(v_progs, 1), 0) = 0 or coalesce(p_plan_id, '') = '' then return jsonb_build_object('image', null); end if;
  v_img := (select p.data -> 'pub' ->> 'image' from public.pi_plans_ensemble p
             where p.id = p_plan_id
               and coalesce(p.data ->> 'publie', '') = 'true' and coalesce(p.data ->> '_deleted', '') <> 'true'
               and (p.data ->> 'programme_id') = any (v_progs)
               and not exists (select 1 from public.pi_suppressions s where s.id = 'ts::plans_ensemble::' || p.id));
  -- Seules les images raster sont servies (jamais de SVG ni de HTML).
  if v_img is null or v_img !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then return jsonb_build_object('image', null); end if;
  return jsonb_build_object('image', v_img);
end
$f$;
revoke all on function public.fc_vue_plan_ensemble_image(text) from public, anon;
grant execute on function public.fc_vue_plan_ensemble_image(text) to authenticated;

-- ── Retour arrière ─────────────────────────────────────────────────────────
-- drop function if exists public.fc_vue_plan_ensemble_image(text);
-- drop function if exists public.fc_vue_plan_ensemble();
-- drop function if exists public.fc_programmes_souscripteur();
-- drop table if exists public.pi_plans_ensemble;
