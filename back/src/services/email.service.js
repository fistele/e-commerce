const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const ErrorResponse = require('../utils/error.response');
const logger = require('../utils/logger');
const { convert } = require('html-to-text');

class EmailService {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
    this.url = url;
    this.from = `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`;
  }

  // Création du transporteur (dev/prod)
  static newTransport() {
    if (process.env.NODE_ENV === 'production') {
      // Configuration pour SendGrid
      return nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD
        }
      });
    }

    // Configuration Mailtrap pour le développement
    return nodemailer.createTransport({
      host: process.env.EMAIL_DEV_HOST,
      port: process.env.EMAIL_DEV_PORT,
      auth: {
        user: process.env.EMAIL_DEV_USERNAME,
        pass: process.env.EMAIL_DEV_PASSWORD
      }
    });
  }

  // Rendu du template EJS
  async renderTemplate(template, data) {
    try {
      const templatePath = path.join(__dirname, `../views/emails/${template}.ejs`);
      const html = await ejs.renderFile(templatePath, {
        firstName: this.firstName,
        url: this.url,
        ...data
      });

      return html;
    } catch (err) {
      logger.error(`Erreur rendu template email: ${err}`);
      throw new ErrorResponse('Erreur lors de la génération du contenu email', 500);
    }
  }

  // Envoi générique d'email
  async send(template, subject, data = {}) {
    try {
      // 1) Rendu HTML
      const html = await this.renderTemplate(template, data);
      
      // 2) Options email
      const mailOptions = {
        from: this.from,
        to: this.to,
        subject,
        html,
        text: convert(html) // Version texte pour compatibilité
      };

      // 3) Création transport et envoi
      await EmailService.newTransport().sendMail(mailOptions);
    } catch (err) {
      logger.error(`Échec envoi email: ${err}`);
      throw err; // Propagation pour gestion centralisée
    }
  }

  // ==================== Méthodes spécifiques ====================

  async sendWelcome() {
    await this.send('welcome', 'Bienvenue sur notre plateforme e-commerce !');
  }

  async sendPasswordReset() {
    await this.send(
      'passwordReset',
      'Votre lien de réinitialisation de mot de passe (valide 10 minutes)'
    );
  }

  async sendOrderConfirmation(order) {
    await this.send(
      'orderConfirmation',
      `Confirmation de commande #${order.orderNumber}`,
      { order }
    );
  }

  async sendEmailVerification() {
    await this.send(
      'emailVerification',
      'Veuillez vérifier votre adresse email'
    );
  }

  async sendShippingNotification(trackingNumber) {
    await this.send(
      'shippingNotification',
      'Votre commande a été expédiée !',
      { trackingNumber }
    );
  }
}

module.exports = EmailService;