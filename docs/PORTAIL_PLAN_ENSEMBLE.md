# Plan d'ensemble (plan directeur) dans le portail souscripteur

Écran ERP : Foncier › **Plan d'ensemble**. Portail : espace souscripteur › **🧭 Plan d'ensemble** (à côté de « Plan 3D »).
Table cloud : `pi_plans_ensemble` ; fonctions `fc_vue_plan_ensemble()` et `fc_vue_plan_ensemble_image(plan)` (`supabase/portail_plan_ensemble.sql`).

## Décisions de conception (par défaut prudent)

Trois questions étaient restées sans réponse ; elles sont traitées par la règle la plus sûre.

| Question | Règle retenue |
|---|---|
| Plan visé par l'urbanisme ? | Chaque plan porte un **statut juridique** affiché au souscripteur, avec une mention qui ne se retire pas : **projet MENKO** (indicatif, non approuvé, sans valeur contractuelle) · **déposé à l'urbanisme** (en instruction) · **approuvé par arrêté** (référence de l'acte **obligatoire**, contrôlée par l'ERP et par la base) |
| Phases futures ? | Affichées seulement si la direction les saisit ; toujours sous la mention « **phases prévisionnelles : calendrier indicatif, sans engagement de date** » |
| Format ? | **Image** JPEG, PNG ou WebP, réduite dans le navigateur (2 000 px, JPEG, 600 Ko au plus). Un PDF se convertit d'abord en image. **Pas de 3D** à ce stade (le plan 3D des lots existe déjà) |

## Publication

- **Brouillon par défaut** : rien n'est visible tant qu'un **administrateur** n'a pas cliqué « Publier » (confirmation avec le statut, la mention et le contenu).
- La publication **fige une copie** (`pub`). Modifier le brouillon ensuite ne change rien au portail ; l'écran signale « brouillon modifié : republier ».
- « Retirer » repasse le plan en brouillon. Historique des publications et journal d'actions.
- Aperçu « tel que vu par le souscripteur » avant publication.

## Sécurité

- Le souscripteur ne voit que les plans **publiés des programmes de ses lots** (identité lue dans le jeton ; l'image est demandée par identifiant et **re-contrôlée** contre ses programmes : pas d'IDOR).
- Jamais renvoyés : remarques internes, auteur, historique.
- Images servies **seulement si raster** (contrôle côté base et côté portail) : pas de SVG, de HTML ni de script.
- Table en RLS forcée, aucun accès `anon`.

## Limites

- Image en base (comme les documents joints) : adapté à quelques plans par programme.
- Pas de PDF ni de 3D. Pas de lien automatique avec les couches du Territoire.
- Publier un plan non approuvé crée une attente chez les acquéreurs : la mention le dit, mais la décision de publier reste celle de la direction.
- Retour arrière : voir la fin du fichier SQL.
