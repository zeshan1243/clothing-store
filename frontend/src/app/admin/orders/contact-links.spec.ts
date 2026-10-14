import { confirmationMessage, formatQatarPhone, whatsappLink, whatsappNumber } from './contact-links';

describe('contact links', () => {
  it('builds wa.me numbers only for Qatar mobiles', () => {
    expect(whatsappNumber('+97455123456')).toBe('97455123456');
    expect(whatsappNumber('+97444123456')).toBeNull(); // landline
    expect(whatsappNumber('+923001234567')).toBeNull();
  });

  it('formats Qatar numbers for display', () => {
    expect(formatQatarPhone('+97455123456')).toBe('+974 5512 3456');
  });

  it('prefills an encoded confirmation message', () => {
    const message = confirmationMessage({
      order_number: 'ORD-2026-00001',
      customer_name: 'Aisha Khan',
      grand_total: '215.00',
      delivery_area: 'Al Sadd',
      items: [{ product_name: 'Hoodie', colour: 'Black', size: 'M', quantity: 2 }],
    });
    expect(message).toContain('Hi Aisha');
    expect(message).toContain('2 × Hoodie (Black, M)');
    expect(message).toContain('QAR 215.00');
    const link = whatsappLink('+97455123456', message)!;
    expect(link.startsWith('https://wa.me/97455123456?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toBe(message);
  });
});
