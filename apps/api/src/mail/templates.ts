import type { MailMessage } from './mail.service';

type Locale = 'ar' | 'fr' | 'en';

const resetCopy: Record<Locale, { subject: string; body: (link: string) => string }> = {
  ar: {
    subject: 'إعادة تعيين كلمة المرور',
    body: (link) =>
      `لإعادة تعيين كلمة المرور افتح الرابط التالي (صالح لمدة ساعة):\n${link}\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.`,
  },
  fr: {
    subject: 'Réinitialisation du mot de passe',
    body: (link) =>
      `Pour changer votre mot de passe, ouvrez ce lien (valable 1 heure) :\n${link}\nSi vous n'avez rien demandé, ignorez ce message.`,
  },
  en: {
    subject: 'Reset your password',
    body: (link) =>
      `To reset your password, open this link (valid for 1 hour):\n${link}\nIf you did not ask for it, ignore this message.`,
  },
};

export function resetPasswordEmail(to: string, locale: string, link: string): MailMessage {
  const copy = resetCopy[(locale in resetCopy ? locale : 'en') as Locale];
  return { to, subject: copy.subject, text: copy.body(link) };
}
