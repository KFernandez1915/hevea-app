# Application de Gestion des Planteurs d'Hevea

Application web qui remplace le fichier Excel mensuel : gestion des planteurs,
saisie des pesees, calcul automatique des montants (poids x prix du kg du mois),
recapitulatif exportable (PDF/Excel), et portail personnel pour chaque planteur.

Correspond au cahier des charges valide (voir document Word fourni separement).

## Stack technique

- **Backend** : Node.js + Express
- **Vues** : EJS (rendu cote serveur, pas besoin de build frontend separe)
- **Base de donnees** : SQLite (via `better-sqlite3`) — fichier unique, aucune
  installation de serveur de base de donnees necessaire. Peut migrer vers
  PostgreSQL/MySQL plus tard si le volume augmente fortement.
- **Authentification** : sessions serveur (`express-session`) + mots de passe
  chiffres (`bcryptjs`)
- **Export** : `exceljs` (Excel) et `pdfkit` (PDF)

## Installation

```bash
npm install
cp .env.example .env
npm start
```

L'application demarre sur `http://localhost:3000`.

Au tout premier demarrage, un compte administrateur est cree automatiquement
si aucun n'existe. Les identifiants sont affiches dans la console et
correspondent par defaut a :

- identifiant : `admin`
- mot de passe : `ChangerCeMotDePasse123`

**Important : connectez-vous et changez ce mot de passe (ou modifiez
`ADMIN_DEFAULT_USER` / `ADMIN_DEFAULT_PASSWORD` dans `.env` avant le tout
premier demarrage).**

## Donnees de demonstration (optionnel)

Pour tester rapidement avec quelques planteurs et pesees deja enregistres :

```bash
npm run seed
```

## Fonctionnement general

### Espace administrateur (`/admin`)

- **Planteurs** : creation (identifiant + mot de passe temporaire generes
  automatiquement, envoyes par SMS), liste avec recherche, modification,
  suppression logique (le planteur est desactive, son historique est
  conserve), reactivation.
- **Saisie mensuelle** (`/admin/mois`) : definir le prix du kg du mois (unique,
  fixe par l'Etat) et enregistrer les pesees. Un planteur peut etre pese
  plusieurs fois dans le mois — les poids sont automatiquement cumules.
- **Recapitulatif** (`/admin/recap`) : tableau automatique par planteur (poids
  cumule, montant), export PDF ou Excel en un clic.
- **Historique** : liste de tous les mois deja traites, avec acces au
  recapitulatif de chacun.

### Espace planteur (`/planteur`)

- Connexion avec l'identifiant/mot de passe recus par SMS.
- Consultation du prix du kg du mois, du poids cumule et du montant a
  percevoir pour le mois en cours.
- Historique complet des mois precedents.
- Changement de mot de passe (fortement recommande des la premiere
  connexion, un mot de passe temporaire est signale a l'ecran).

## SMS d'identifiants

L'envoi des identifiants par SMS est centralise dans
`src/utils/sms.js`. En l'etat, il ecrit simplement le message dans la
console (mode simulation), ce qui permet de developper et tester sans
dependre d'un fournisseur SMS payant.

Pour brancher un fournisseur reel (Orange SMS API, MTN, Twilio...), completer
la fonction `envoyerIdentifiantsParSms` avec l'appel HTTP correspondant, et
renseigner `SMS_API_KEY` dans `.env`.

En phase de developpement/test, un envoi par mail gratuit (ex : Nodemailer +
un compte Gmail ou un service comme Mailtrap) peut egalement etre branche de
la meme maniere.

## Structure du projet

```
src/
  server.js         Point d'entree Express
  db.js             Connexion + schema SQLite + creation de l'admin par defaut
  routes/
    auth.js         Connexion / deconnexion admin et planteur
    admin.js         Gestion planteurs, saisie mensuelle, recap, export
    planteur.js       Espace personnel planteur
  middleware/
    auth.js          Protection des routes admin / planteur
  utils/
    helpers.js       Generation identifiant/mot de passe, formatage
    sms.js            Envoi des identifiants (a brancher sur un vrai fournisseur)
    export.js         Generation des fichiers Excel et PDF
  seed.js             Donnees de demonstration
views/                Templates EJS (admin, planteur, partials communs)
public/css/           Feuille de style
data/                 Fichier de base de donnees SQLite (cree automatiquement)
```

## Modele de donnees

- **planteurs** : identite, contact, contact de paiement, moyen de paiement,
  identifiant/mot de passe, statut (actif/inactif).
- **prix_mois** : un prix du kg par periode (`YYYY-MM`), unique pour tous les
  planteurs.
- **pesees** : chaque passage de pesee (planteur, periode, date, poids). Le
  poids total du mois pour un planteur est la somme de ses pesees sur cette
  periode ; le montant est calcule a la volee (poids total x prix du mois),
  jamais stocke en dur, pour rester toujours coherent si une pesee est
  corrigee.

## Points a prevoir pour la mise en production

- Remplacer le mode SMS simule par un vrai fournisseur.
- Servir l'application derriere HTTPS (obligatoire pour la securite des
  sessions et des mots de passe).
- Definir des variables `.env` fortes (`SESSION_SECRET`, identifiants admin).
- Mettre en place des sauvegardes regulieres du fichier `data/hevea.db`.
- Si le volume de planteurs/mois augmente fortement, migrer de SQLite vers
  PostgreSQL (le code d'acces aux donnees est isole dans `src/db.js` et les
  requetes SQL des routes, ce qui limite l'impact d'une migration).
