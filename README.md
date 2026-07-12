# Portail Partner Immo CI — sécurisation (souscripteur + apporteur + acquéreur foncier)

## Ce qui a été corrigé
Le portail v1 vérifiait le code **dans le navigateur** et lisait/écrivait Supabase avec la **clé anon** → n'importe qui pouvait vider `pi_clients`, `pi_users`, etc. via l'API.

Correctifs de ce kit :
- **Auth serveur** : Edge Function `portal-login` vérifie dossier+code, applique un anti-brute-force, émet un **JWT scoped** (claims `kind` + `scope_id`).
- **RLS** : la clé anon ne lit plus rien de nominatif ; chaque portail ne voit que **son périmètre**. `pi_users`/`pi_employes` verrouillés.
- **Portail refactoré** : tous les appels passent le token scoped ; suppression des lectures `pi_users`/`pi_employes` (contacts staff désormais publiés dans `pi_params.portail.staff_portail`).

## Fichiers
- `portal-login/index.ts` — Edge Function (souscripteur `pi_clients` + apporteur `pi_apporteurs` + **acquéreur foncier `pi_cessions_foncieres`**).
- `portal_rls.sql` — RLS de toutes les tables du portail + verrouillage des tables sensibles (dont **cessions foncières** + **déclarations de versement** scoping foncier).
- `portail-unique.html` — portail sécurisé (auth via fonction, token scoped) avec **3 accès** : souscripteur, apporteur, acquéreur foncier.

### Accès Acquéreur foncier
- Onglet **FONCIER** : connexion par n° dossier / email / téléphone + code.
- Tableau de bord : prix de cession, déjà versé, reste, avancement, liste des versements.
- **Déclaration de versement reliée au recouvrement** : insert dans `pi_declarations_versement_foncier` (statut `en_attente`, `canal='portail'`) → validée côté ERP (module recouvrement), jamais automatiquement. L'acquéreur suit l'état (en attente / validé / rejeté).

## Personnalisation (white-label, sans toucher au code)
Le portail lit son branding dans `pi_params` (ligne `id='portail'`, champ `data`). Toutes les clés sont optionnelles ; à défaut, l'identité Partner Immo CI s'applique.

| Clé (`data.…`) | Effet |
|---|---|
| `nom` | Nom de marque (logo texte + titre onglet) |
| `logo_url` | Logo image (remplace le texte) |
| `slogan` | Sous-titre du logo |
| `couleur_primaire` / `couleur_secondaire` / `couleur_primaire_dark` | Couleurs (onglets, boutons, hero, dégradés) |
| `hero_image` | Image de fond du bandeau héro |
| `hero_titre` / `hero_texte` | Titre + texte du héro |
| `footer_texte` | Mentions de pied de page |
| `contact_whatsapp` | Numéro du bouton WhatsApp |
| `bandeau_texte` / `bandeau_couleur` | Bandeau défilant (déjà en place) |
| `staff_portail` | Contacts staff de la messagerie `[{id,nom,poste,type}]` |

Exemple de mise à jour (SQL) :
```sql
update pi_params set data = data || jsonb_build_object(
  'nom','Ma Société Immo', 'couleur_primaire','#0f766e',
  'hero_titre','Votre logement, notre engagement'
) where id = 'portail';
```

## Déploiement (préprod d'abord)
1. `portal_rls.sql` en **préprod**. ⚠️ Active la RLS → l'app **staff** perd l'accès anon : prévoir sa bascule (Edge Functions service_role, ou JWT staff + policies `staff=true`) **avant la prod** (encart en fin de SQL).
2. Edge Function :
   ```
   supabase functions deploy portal-login --no-verify-jwt
   supabase secrets set SB_URL=https://izgpvhwhbrgeagjfhfli.supabase.co
   supabase secrets set SB_SERVICE_ROLE=<service_role_key>
   supabase secrets set SB_JWT_SECRET=<Settings ▸ API ▸ JWT secret>
   ```
3. Publier `portail-unique.html` ; restreindre le CORS de l'Edge Function à ce domaine.
4. **Contacts staff du portail** : renseigner `pi_params` (id `portail`) → `data.staff_portail = [{id,nom,poste,type}]`.

## À planifier
- Migrer les codes en clair (`code_acces`/`mot_de_passe`) vers `code_acces_hash`+`salt`, puis **retirer le fallback clair** dans l'Edge Function.
- Rotation du **JWT secret** si l'ancienne clé anon a pu fuiter (invalide toutes les clés — coordonner avec l'app staff).
- Restreindre le CORS (`Access-Control-Allow-Origin`) au domaine du portail.
