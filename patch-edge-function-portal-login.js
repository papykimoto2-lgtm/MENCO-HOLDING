/* ═══════════════════════════════════════════════════════════════
   PATCH — Edge Function `portal-login`
   Ajout du kind 'coproprietaire' (Espace Copropriétaire du portail).

   À FUSIONNER MANUELLEMENT dans la fonction existante : repérez la
   table/switch qui associe chaque `kind` reçu du portail à une table
   Supabase et aux colonnes d'identifiant (souscripteur → pi_clients,
   apporteur → pi_apporteurs, foncier → pi_cessions_foncieres,
   mandant → pi_proprietaires_bailleurs, etc.) et ajoutez l'entrée
   ci-dessous suivant le même schéma.
   ═══════════════════════════════════════════════════════════════ */

// Exemple si la fonction utilise une table de correspondance (adapter au nom réel) :
const KIND_TABLE_MAP = {
  souscripteur: { table: 'pi_clients', identCols: ['dossier', 'email', 'tel'] },
  apporteur:    { table: 'pi_apporteurs', identCols: ['email', 'tel'] },
  foncier:      { table: 'pi_cessions_foncieres', identCols: ['dossier', 'email', 'tel'] },
  mandant:      { table: 'pi_proprietaires_bailleurs', identCols: ['convention', 'email', 'tel'] },
  locataire:    { table: 'pi_clients', identCols: ['email', 'tel'] }, // NB: locataire réutilise le login souscripteur côté portail

  // ── AJOUT ──
  coproprietaire: { table: 'pi_lots_copro', identCols: ['proprietaire_email', 'proprietaire_tel'] },
};

/* Logique de vérification (déjà existante dans la fonction, inchangée) :
   1. SELECT id, data FROM <table> WHERE data->>identCol = ident (email OU tel)
   2. Vérifier code contre data.code_acces_hash + data.code_acces_salt (SHA-256)
   3. Émettre un access_token scoped (JWT) avec { kind, id: row.id }
   4. Retourner { access_token, kind, id }

   Le lot pi_lots_copro suit exactement le même schéma de champs que
   pi_clients/pi_apporteurs : code_acces_hash, code_acces_salt,
   code_acces_date — générés côté ERP par genererCodeCoproprietaire().
   Aucune adaptation de la logique de hachage n'est nécessaire. */
