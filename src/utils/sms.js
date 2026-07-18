/**
 * Envoi du SMS contenant les identifiants de connexion d'un planteur.
 *
 * En l'etat, cette fonction se contente d'ecrire le message dans la console
 * (utile en developpement/demo). Pour une mise en production, brancher ici
 * un fournisseur SMS reel (ex: Orange SMS API, MTN, Twilio...) en utilisant
 * les variables d'environnement SMS_API_KEY / SMS_SENDER definies dans .env.
 *
 * Un envoi par mail gratuit (ex: via Nodemailer + Gmail/Mailtrap) peut aussi
 * etre utilise en phase de developpement/test, voir README.md.
 */
async function envoyerIdentifiantsParSms(numeroTelephone, identifiant, motDePasse) {
  const message =
    `Bienvenue. Vos identifiants pour l'espace planteur : ` +
    `Identifiant: ${identifiant} / Mot de passe: ${motDePasse}. ` +
    `Merci de le modifier a la premiere connexion.`;

  if (process.env.SMS_API_KEY) {
    // TODO: integrer ici l'appel HTTP vers le fournisseur SMS choisi.
    console.log(`[SMS -> ${numeroTelephone}] (integration reelle a completer) ${message}`);
  } else {
    console.log(`[SMS SIMULE -> ${numeroTelephone}] ${message}`);
  }

  return { envoye: true, canal: 'sms-simule', message };
}

/**
 * Envoi du code de reinitialisation de mot de passe par SMS.
 * Meme principe que envoyerIdentifiantsParSms : simule l'envoi en dev,
 * a brancher sur un vrai fournisseur SMS en production.
 */
async function envoyerCodeReinitialisationParSms(numeroTelephone, code) {
  const message =
    `Code de reinitialisation de votre mot de passe Hevea : ${code}. ` +
    `Ce code expire dans 15 minutes. Ne le partagez avec personne.`;

  if (process.env.SMS_API_KEY) {
    // TODO: integrer ici l'appel HTTP vers le fournisseur SMS choisi.
    console.log(`[SMS -> ${numeroTelephone}] (integration reelle a completer) ${message}`);
  } else {
    console.log(`[SMS SIMULE -> ${numeroTelephone}] ${message}`);
  }

  return { envoye: true, canal: 'sms-simule', message };
}

module.exports = { envoyerIdentifiantsParSms, envoyerCodeReinitialisationParSms };
