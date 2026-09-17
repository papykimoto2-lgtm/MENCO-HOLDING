# staff-login — contrat vérifié

> **Mise à jour :** ce document a d'abord été rédigé par déduction, faute
> d'accès aux projets Supabase. L'accès ayant été accordé, **les sources
> déployées ont été récupérées et tout ce qui suit est désormais vérifié sur
> la base réelle.** Deux affirmations de la version précédente étaient
> fausses ; elles sont signalées comme telles ci-dessous plutôt que
> silencieusement effacées.

Sources déployées, récupérées et déposées à côté de ce fichier :

| Instance | Projet | Version | Fichier |
|---|---|---|---|
| Zahara | `ilvusckdanwrckxqvhmr` | **v7** | `functions/staff-login/index.ts` (dépôt Zahara) |
| Menco | `pxwgefdxgrskusjbzrxz` | **v7** (déployée le 17/09/2026) | `functions/staff-login/index.ts` (dépôt Menco) |

> **État au 17/09/2026 — portage v4 → v7 effectué ET DÉPLOYÉ sur Menco.**
> Le code des deux instances est désormais **identique à l'origine CORS près**,
> seule divergence légitime (voir §3), dans le dépôt comme en production.
> Le déploiement a été fait le 17/09/2026 sur `pxwgefdxgrskusjbzrxz` (compteur
> Supabase : version 5), et la source servie a été reliue pour confirmer
> qu'elle correspond octet pour octet à ce fichier. Aucun secret n'a été
> ajouté ni modifié : la v7 lit exactement les mêmes que la v4.
>
> La description des défauts v4 est conservée plutôt qu'effacée : elle
> documente ce qui a été réparé, et elle explique pourquoi l'audit des
> connexions serveur est vide pour toute la période antérieure.

---

## 1. Contrat, vérifié

### Requête

`POST {SB_URL}/functions/v1/staff-login` — appelée par `staffLogin()`, index.html:25122

| | |
|---|---|
| En-têtes | `Content-Type: application/json`, `apikey`, `Authorization: Bearer <sbAuth()>` |
| Corps | `{ "login": "...", "motdepasse": "..." }` (`password` accepté aussi) |
| `verify_jwt` | **false** sur les deux instances — la fonction est appelable sans jeton, ce qui est nécessaire pour ouvrir une session |

### Réponse

```json
{ "ok": true, "token": "<JWT>", "expires_in": 28800,
  "user": { "id", "login", "nom", "role", "email", "tel", "statut", "must_change" } }
```

- **`expires_in` vaut 28800 s (8 h)**, pas 43200. *(Correction : la version
  précédente de ce document annonçait 12 h, valeur qui n'est que le repli du
  client si le champ était absent — il ne l'est pas.)*
- Le profil renvoyé ne contient ni `password_hash` ni `salt`, conformément à
  ce que le client suppose.
- Le compte doit avoir **`statut === "actif"`** *(correction : le document
  précédent citait un champ `actif`, qui n'existe pas)*, sinon 403.

### Claims du jeton — la réponse à la question qui bloquait la phase 2

```json
{ "aud": "authenticated", "role": "authenticated",
  "app_role": "<rôle métier>", "sub": "<id utilisateur>",
  "login": "<login>", "iat": ..., "exp": ... }
```

**Le claim distinctif est `app_role`.** Il porte le rôle métier (admin,
manager, caissière…). Les jetons du portail, eux, portent `kind` /
`portal_kind` et **jamais** `app_role` : c'est donc `app_role` qui distingue
un membre du personnel d'un souscripteur, et c'est sur lui que les politiques
RLS du personnel doivent s'appuyer.

Le jeton est signé en HS256 avec `SB_PROJECT_JWT_SECRET` (le *Legacy JWT
Secret* du projet), ce qui le rend reconnaissable nativement par PostgREST.

### Mots de passe

PBKDF2-HMAC-SHA256, **210 000 itérations**, sel en clair dans `salt`, hash
hexadécimal dans `password_hash`, algorithme dans `pwd_algo`, itérations dans
`pwd_iter`. Un compte encore en SHA-256+sel est migré vers PBKDF2 à sa
première connexion réussie. Ces valeurs correspondent exactement à
`pbkdf2Client()` (index.html:28123) — la vérification hors ligne reste donc
valide.

---

## 2. ⚠️ Ce que l'inspection a démenti

La version précédente de ce document affirmait, en se fiant à un commentaire
de l'ERP (index.html:28624), que *« les politiques RLS de pi_users sont déjà
actives et rejettent la clé anon »*.

**C'est faux.** Interrogation directe des deux bases :

```
pi_users → policy "anon_all"  : roles {anon},          cmd ALL, qual true, with_check true
           policy "auth_all"  : roles {authenticated}, cmd ALL, qual true, with_check true
```

Et sur l'ensemble des tables, pour **les deux instances** :

| | Zahara | Menco |
|---|---|---|
| Tables `pi_*` | 162 | 162 |
| RLS activée | 162 | 162 |
| Politique `anon` **sans aucune condition** | **162** | **162** |

La RLS est donc activée partout mais **entièrement permissive** : la clé
anon — qui figure en clair dans le portail public — donne un accès complet en
lecture **et en écriture** à toutes les tables, `pi_users` comprise.

Conséquence : le mécanisme jeton → politique → accès n'est **pas** déjà
éprouvé en production, contrairement à ce que je croyais. La phase 2 doit
donc le valider par le pilote avant toute extension, et non le supposer
acquis.

---

## 3. Divergence entre les deux instances

### Après portage — source du dépôt

| | Zahara v7 | Menco v7 |
|---|---|---|
| Origine CORS | `https://zahara-multiservices.vercel.app` | `https://erp-menko-holding.com` |
| Anti-force-brute | 10 échecs / 15 min | 10 échecs / 15 min |
| Échecs comptés | ceux vérifiés serveur (`data.src="srv"`) | ceux vérifiés serveur (`data.src="srv"`) |
| Accès aux journaux | `data->>login` (jsonb) | `data->>login` (jsonb) |
| Login en double | toutes les lignes essayées, actifs d'abord | toutes les lignes essayées, actifs d'abord |

**L'origine CORS est la seule divergence restante**, et elle est voulue : elle
est propre au domaine de chaque instance. Les deux projets partagent le même
schéma `pi_logs_connexion` — `{ id, data jsonb, updated_at, scope_id }`,
vérifié des deux côtés — et les mêmes noms de secrets, ce qui rend le code
transposable tel quel.

### Avant portage — ce que la v4 faisait, et qui reste déployé sur Menco

| | Zahara v6/v7 | Menco v4 (déployée) |
|---|---|---|
| Anti-force-brute | 10 échecs / 15 min | 5 échecs / 24 h |
| Échecs comptés | ceux vérifiés serveur (`data.src="srv"`) | tous |
| Accès aux journaux | `data->>login` (jsonb) | `login` (colonne plate) |
| Login en double | toutes les lignes essayées | `maybeSingle()` → 401 systématique |

**Le compteur de Menco est inopérant.** `pi_logs_connexion` y a pour schéma
`{ id, data jsonb, updated_at, scope_id }` — vérifié — et ne possède donc
aucune colonne `login`, `success` ni `date`. La requête de comptage échoue,
`count` reste nul, le verrou ne se déclenche jamais. Pour la même raison, les
insertions de journal échouent : **aucune trace serveur des connexions**,
réussies ou non.

Un troisième défaut, plus grave, a été identifié ensuite : `maybeSingle()`
échouait (PGRST116) dès qu'un login existait en plusieurs exemplaires dans
`pi_users`, et l'erreur n'étant pas vérifiée, la fonction répondait
« Identifiant introuvable » (401) — **aucune connexion serveur possible pour
un login dupliqué, quel que soit le mot de passe**. Corrigé en v7.

Zahara v6/v7 corrige les trois points, et documente en outre un incident réel :
le compteur comptait aussi les échecs écrits par le navigateur, si bien que
cinq fautes de frappe dans la journée bloquaient `staff-login` pour tout le
monde pendant 24 h — et faisaient retomber l'ERP entier sur la clé anon.

### Reste à faire

- [x] **Déployer** la v7 sur `pxwgefdxgrskusjbzrxz` — fait le 17/09/2026.
- [x] `portal-login` déployé le même jour (version 2) : 9 profils au lieu de 7,
  lecture paginée, normalisation des numéros, claims `kind`/`scope_id`
  rétablis. Les 9 tables cibles ont été vérifiées présentes sur le projet.
- [ ] **Vérifier après la première connexion réelle** que le compteur de
  connexions serveur décolle enfin :
  `select count(*) from pi_logs_connexion where data->>'src'='srv'`.
  Il valait 0 avant ce déploiement, la v4 écrivant dans des colonnes
  inexistantes. Un zéro persistant après connexion signifierait que
  `SB_PROJECT_JWT_SECRET` est absent ou erroné.
- [ ] Nettoyer les doublons de `pi_users` : aucun sur Menco aujourd'hui
  (26 comptes, 0 doublon — vérifié), mais la v7 les rend non bloquants si
  le cas se présente.

---

## 4. État des vérifications de phase 0

- [x] Sources récupérées sur les deux projets — **portées à l'identique en v7,
      hors origine CORS** (§3)
- [x] Claim exigé : aucun. Les politiques sont permissives (§2)
- [x] Claim réellement émis : **`app_role`** (§1)
- [x] Durée réelle du jeton : **8 h**, pas 12 h
- [x] PBKDF2 : 210 000 itérations, conforme à `pbkdf2Client()`
- [ ] Décider du traitement de l'exposition décrite en §2 — **hors phase 0**
