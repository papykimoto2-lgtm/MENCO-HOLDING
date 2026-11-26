# Recette — fermeture de l'accès anonyme à `pull_incremental`

Script concerné : `supabase/securite_acces_anon_a_valider.sql` (préparé, **non exécuté**).
Principe : on le rejoue d'abord sur une **copie** (branche Supabase), on prouve « avant » puis « après » avec quatre identités (clé publique, jeton portail, jeton personnel, `service_role`), on teste l'ERP, on teste le retour arrière, et seulement ensuite la production.

**Critère d'arrêt général** : si un poste du personnel ne se synchronise plus après l'étape 5, exécuter immédiatement le retour arrière (§ 8) et noter le message d'erreur exact.

## 0. Ce qu'il faut avoir sous la main

| Élément | Où le trouver |
|---|---|
| `URL` du projet (`https://<ref>.supabase.co`) | Supabase › Project Settings › API. Menco : `pxwgefdxgrskusjbzrxz` |
| `ANON` (clé publique) | même page ; c'est celle qui est en clair dans les pages du portail |
| `JETON_PERSONNEL` | connexion `staff-login` d'un compte **actif** (§ 2) |
| `JETON_PORTAIL` | connexion `portal-login` d'un souscripteur de test (§ 2) |
| `SERVICE_ROLE` | même page ; **ne jamais le coller dans le chat ni le dépôt** |
| Un poste ERP du personnel et un espace portail de test | navigateur |

Vérifier **l'organisation et le nom du projet** avant chaque commande SQL (confusion de compte possible entre Menco et Zahara).

## 1. Préparer la copie

1. ☐ Sauvegarde fraîche de la production (Database › Backups) et export JSON de l'ERP.
2. ☐ Créer une **branche Supabase** de la production (ou restaurer la sauvegarde dans un projet de test). Noter son `URL` : toutes les commandes suivantes visent cette copie.
3. ☐ Vérifier que l'ERP de test pointe vers la copie, `IMMO_SYNC_ANON_FALLBACK = false`, et que le badge de session du personnel apparaît.
4. ☐ Exporter les variables (dans un terminal, pas dans un fichier du dépôt) :
   ```bash
   export URL="https://<ref-de-la-copie>.supabase.co"
   export ANON="<clé publique>"
   ```

## 2. Obtenir les deux jetons de test

```bash
# Personnel (compte actif de test, rôle non administrateur de préférence)
curl -s -X POST "$URL/functions/v1/staff-login" -H "Content-Type: application/json" -H "apikey: $ANON" \
  -d '{"login":"<login-test>","motdepasse":"<mot-de-passe-test>"}'
# → champ "token" : c'est JETON_PERSONNEL (valable 8 h)

# Portail souscripteur de test
curl -s -X POST "$URL/functions/v1/portal-login" -H "Content-Type: application/json" -H "apikey: $ANON" \
  -d '{"kind":"souscripteur","ident":"<identifiant-test>","code":"<code-test>"}'
# → champ "access_token" : c'est JETON_PORTAIL (valable 2 h)
```

```bash
export JETON_PERSONNEL="<token>"
export JETON_PORTAIL="<access_token>"
```

Contrôle des claims (coller le jeton sur jwt.io n'est pas nécessaire) :
```bash
for J in "$JETON_PERSONNEL" "$JETON_PORTAIL"; do echo "$J" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | python3 -m json.tool; done
```
☐ Le jeton du personnel contient `app_role` ; ☐ le jeton portail contient `kind` et **pas** `app_role`.

## 3. État « avant » (à conserver : `avant.txt`)

Définir une fonction d'appel, puis lancer les trois identités (le `service_role` se teste à part, § 6). **Le nom du paramètre de `pull_documents_meta(text)` n'est pas versionné** : le lire dans la requête SQL ci-dessous (colonne `args`) et remplacer `{}` par `{"<nom>":"<valeur>"}` ; un `{}` vide peut répondre 404 même quand la fonction est ouverte, ce qui fausserait « avant ».

```bash
appel() {  # appel <fonction> <jeton> <corps json>
  curl -s -o /tmp/rep.json -w "%{http_code}" -X POST "$URL/rest/v1/rpc/$1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $2" -H "Content-Type: application/json" -d "$3"
  echo "  $(head -c 120 /tmp/rep.json | tr '\n' ' ')"
}
for ID in ANON JETON_PORTAIL JETON_PERSONNEL; do
  J=$ANON; [ $ID = JETON_PORTAIL ] && J=$JETON_PORTAIL; [ $ID = JETON_PERSONNEL ] && J=$JETON_PERSONNEL
  echo "== $ID"; for F in pull_incremental pull_incremental_v1; do echo -n "$F : "; appel $F "$J" '{"cursors":{}}'; done
  echo -n "pull_documents_meta : "; appel pull_documents_meta "$J" '{}'
done | tee avant.txt
```

Résultat **attendu avant** (c'est la faille) : `ANON` et `JETON_PORTAIL` obtiennent **200** et des données sur `pull_incremental_v1` ; consigner ce qui est constaté.
Côté SQL (SQL Editor de la copie), conserver aussi :
```sql
select proname, pg_get_function_identity_arguments(oid) as args, pg_get_userbyid(proowner) as proprietaire, prosecdef as definer,
       has_function_privilege('anon', oid, 'execute') as anon, has_function_privilege('authenticated', oid, 'execute') as authenticated
  from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('pull_incremental','pull_incremental_v1','pull_documents_meta','_docs_meta_sync','_pi_documents_meta_sync');
select pg_get_functiondef('public.pull_documents_meta(text)'::regprocedure);   -- définition non versionnée : la joindre à la recette
```
☐ Le propriétaire de `pull_incremental` est **postgres** (sinon le wrapper ne pourra pas appeler la v1 : arrêter et corriger d'abord).

## 4. Qui appelle ces fonctions aujourd'hui ?

☐ Sur la **production** : `select funcname, calls from pg_stat_user_functions where schemaname='public' and funcname like 'pull\_%' escape '\';` (nécessite `track_functions = 'all'`, à activer au moins 7 jours avant sinon rien n'est mesuré).
☐ Rechercher dans les journaux de l'API les appels `rpc/pull_incremental*` et `rpc/pull_documents_meta` faits avec la clé `ANON` seule (Logs › API Gateway). Chaque appel anonyme légitime découvert **bloque** l'exécution en production : le traiter d'abord.
☐ Dépôt : seul l'ERP (`menko-immo.html`) appelle `pull_incremental` ; aucun appel à `pull_documents_meta`. Confirmer qu'aucun service externe (automatisation, tableau de bord) n'utilise la clé publique pour ces fonctions.

## 5. Appliquer le script sur la copie

1. ☐ SQL Editor de la **copie** : coller et exécuter `supabase/securite_acces_anon_a_valider.sql`.
2. ☐ Aucune erreur. Un avertissement « `pull_incremental_v1 absente` » signifie que `pull_incremental_complet.sql` n'a jamais été joué sur ce projet : s'arrêter.
3. ☐ Relancer la requête de droits du § 3.

Attendu : `anon = false` partout ; `authenticated = true` **uniquement** pour `pull_incremental` ; `pull_incremental` toujours `definer = true`.

## 6. État « après » (comparer à `avant.txt`)

Relancer la boucle du § 3 en sortie vers `apres.txt`.

| Identité | `pull_incremental` | `pull_incremental_v1` | `pull_documents_meta` |
|---|---|---|---|
| clé publique seule | **refus** (401/403, « permission denied ») | **refus** | **refus** |
| jeton portail | **refus 42501** « réservé au personnel connecté » (HTTP 400/403 selon la passerelle) | **refus** (droit retiré) | **refus** |
| jeton personnel | **200**, tables complètes | **refus** (appel direct non autorisé) | **refus** |
| `service_role` | 200 | 200 | 200 |

Cases à cocher :
- ☐ clé publique : refus sur les trois ;
- ☐ jeton portail : refus sur les trois, **et le message du premier est bien celui du garde** (preuve que le garde fonctionne, pas seulement le droit) ;
- ☐ jeton personnel : `pull_incremental` répond avec des lignes (comparer le nombre de tables clés à `avant.txt`) ;
- ☐ mode léger : `appel pull_incremental "$JETON_PERSONNEL" '{"cursors":{"pi_documents":"","_docs_legers":"oui"}}'` répond **200** et `pi_documents` ne contient pas de fichiers (liste seule) ;
- ☐ curseur incrémental : même appel avec un curseur récent sur une table (`{"cursors":{"pi_clients":"<horodatage d'hier>"}}`) ne renvoie que les lignes plus récentes ;
- ☐ une table créée après la v1 (par ex. `pi_demandes_reappro`) est bien servie par le complément ;
- ☐ `service_role` (depuis un terminal de confiance, variable `SERVICE_ROLE` non affichée) : 200.

## 7. Test fonctionnel dans l'ERP (copie)

Poste du personnel connecté (jeton à jour), ouvrir l'ERP :
1. ☐ Chargement initial complet : aucune erreur « RPC pull_incremental indisponible » dans la console.
2. ☐ Créer une ligne sur le poste A (par ex. un client de test) ; elle apparaît sur le poste B après la synchronisation.
3. ☐ Modifier la ligne sur B ; A reçoit la modification (curseur incrémental).
4. ☐ Documents : la liste s'affiche, un fichier s'ouvre (mode léger puis chargement du fichier).
5. ☐ Demande de réapprovisionnement de caisse : visible des validateurs (table du complément).
6. ☐ Foncier : ouvrir un dossier, la fiche 360°, un manuel de procédures.
7. ☐ Portail souscripteur : connexion, consultation de son dossier et de son plan 3D (n'utilisent pas `pull_incremental` : **ne doit pas changer**).
8. ☐ Jeton du personnel expiré (attendre l'expiration ou le supprimer du navigateur) : les envois sont **différés** et conservés en file locale, puis repartent après reconnexion.
9. ☐ Un poste **non connecté** ne reçoit plus rien et n'affiche pas de données : comportement attendu (pas un échec).

## 8. Test du retour arrière (sur la copie)

```sql
grant execute on function public.pull_incremental(jsonb)    to anon;
grant execute on function public.pull_incremental_v1(jsonb) to anon, authenticated;
grant execute on function public.pull_documents_meta(text)  to anon, authenticated;
notify pgrst, 'reload schema';
```
☐ Relancer § 6 : les droits sont revenus, **mais le garde de `pull_incremental` reste actif** (jeton portail toujours refusé sur `pull_incremental`) : c'est voulu.
☐ Rejouer ensuite le script d'origine : retour à l'état « fermé ».

## 9. Passage en production

Seulement si toutes les cases des § 4 à 8 sont cochées.
1. ☐ Fenêtre calme (hors clôture de caisse), utilisateurs prévenus : le jeton dure 8 h ; au-delà, reconnexion.
2. ☐ Sauvegarde fraîche juste avant. Vérifier organisation **et** nom du projet.
3. ☐ Relever § 3 sur la production (`avant-prod.txt`), exécuter le script, relever § 6 (`apres-prod.txt`).
4. ☐ Un poste du personnel : chargement + création + réception (§ 7, points 1 à 3).
5. ☐ Surveiller 24 h : Logs API, filtre « permission denied » ou « 42501 » sur `rpc/pull_*` ; chaque occurrence est soit une tentative anonyme bloquée (attendu), soit un poste mal connecté (à accompagner).
6. ☐ Joindre `avant*.txt`, `apres*.txt` et la définition de `pull_documents_meta` à la revue ; mettre à jour `docs/REVUE_MODULE_FONCIER.md` (point 1 : exécuté le … sur …).

## 10. Résultat à consigner

| Étape | Date | Exécutant | Projet | Résultat | Remarque |
|---|---|---|---|---|---|
| Copie : avant (§ 3) | | | | | |
| Copie : script (§ 5) | | | | | |
| Copie : après (§ 6) | | | | | |
| Copie : ERP (§ 7) | | | | | |
| Copie : retour arrière (§ 8) | | | | | |
| Production (§ 9) | | | | | |

## Ce que cette recette ne couvre pas

- La liste blanche de tables du complément de `pull_incremental` (la liste de la v1 n'est pas versionnée) ;
- les 161 tables legacy aux politiques `*_open_rollback` (voir `supabase/RLS_RECETTE_FERMETURE.md`) ;
- les règles « administrateur » appliquées seulement par l'ERP.
