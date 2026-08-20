Corrections préparées pour KFernandez1915/hevea-app

Objectif :
- corriger les alertes Semgrep réelles sans modifier SQLite, les tables, les données ou le design ;
- éviter les changements destructifs ;
- laisser les alertes historiques/faux positifs explicitement documentées.

Fichiers prêts à remplacer :
- src/server.js
- export-data.js
- .gitignore

Fichier de procédure :
- PATCH_ADMIN_ET_VIEWS.txt

Après remplacement :
1. npm test (si un script test existe)
2. npm start / npm run dev
3. tester connexion admin, connexion planteur, création de planteur,
   suppression/restauration, informations, exports et graphiques.
4. relancer Semgrep.

IMPORTANT :
Le rapport indique des bcrypt hashes dans initial-data.sql, mais les chemins
référencés par le rapport ne sont plus présents sur main. Il ne faut donc pas
modifier la base de données pour cette alerte.
