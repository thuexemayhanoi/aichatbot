/**
 * Contact rule: phone/Zalo/WhatsApp/email/maps answers.
 * Channel priority follows the entities detected in the turn; when several
 * channels appear, the first detected one wins (deterministic).
 */
export function createContactRule({ business } = {}) {
  return {
    id: 'contact-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'contact_query';
    },
    respond(analysis) {
      const contact = business.contact;
      const brand = business.brand;
      const channel = analysis?.entities?.contactChannels?.[0]?.id ?? 'phone';

      if (channel === 'zalo') {
        return {
          handled: true,
          answer: `Bạn có thể liên hệ ${brand} qua Zalo: ${contact.phone_display}.`,
          actions: [{ label: 'Mở Zalo', href: contact.zalo }],
          confidence: 1,
          source: 'business-data'
        };
      }
      if (channel === 'whatsapp') {
        return {
          handled: true,
          answer: `Bạn có thể liên hệ ${brand} qua WhatsApp: ${contact.phone_display}.`,
          actions: [{ label: 'Mở WhatsApp', href: contact.whatsapp }],
          confidence: 1,
          source: 'business-data'
        };
      }
      if (channel === 'email') {
        return {
          handled: true,
          answer: `Email của ${brand}: ${contact.email}.`,
          actions: [{ label: 'Gửi email', href: `mailto:${contact.email}` }],
          confidence: 1,
          source: 'business-data'
        };
      }
      if (channel === 'maps') {
        return {
          handled: true,
          answer: `Bạn có thể xem vị trí của ${brand} trên Google Maps.`,
          actions: [{ label: 'Xem bản đồ', href: contact.maps }],
          confidence: 1,
          source: 'business-data'
        };
      }
      return {
        handled: true,
        answer: `Số điện thoại của ${brand}: ${contact.phone_display}. Bạn có thể gọi điện hoặc nhắn Zalo qua số này.`,
        actions: [
          { label: 'Gọi điện', href: contact.phone_uri },
          { label: 'Zalo', href: contact.zalo }
        ],
        confidence: 1,
        source: 'business-data'
      };
    }
  };
}
