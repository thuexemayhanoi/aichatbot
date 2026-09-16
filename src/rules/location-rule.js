/**
 * Location rule: business address questions ("ở đâu", "địa chỉ").
 * Answered only from the authoritative address in business data, with the
 * approved Google Maps link as an action.
 */
export function createLocationRule({ business } = {}) {
  return {
    id: 'location-rule',
    canHandle(analysis) {
      return analysis?.intent?.id === 'location_query';
    },
    respond() {
      return {
        handled: true,
        answer: `Địa chỉ ${business.display_name}: ${business.address.full}. Bạn có thể xem vị trí trên Google Maps.`,
        actions: [{ label: 'Xem bản đồ', href: business.contact.maps }],
        confidence: 1,
        source: 'business-data'
      };
    }
  };
}
