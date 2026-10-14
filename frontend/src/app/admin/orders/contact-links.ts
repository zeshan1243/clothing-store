import { environment } from '../../../environments/environment';

/** Digits-only international number for wa.me (e.g. "97455123456"), or null if not a Qatar mobile. */
export function whatsappNumber(e164: string): string | null {
  const digits = e164.replace(/\D/g, '');
  return /^974[3567]\d{7}$/.test(digits) ? digits : null;
}

/** "+974 5512 3456" for display. */
export function formatQatarPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const m = digits.match(/^974(\d{4})(\d{4})$/);
  return m ? `+974 ${m[1]} ${m[2]}` : e164;
}

export interface ContactOrderInfo {
  order_number: string;
  customer_name: string;
  grand_total: string;
  delivery_area: string;
  items: { product_name: string; colour: string; size: string; quantity: number }[];
}

export function confirmationMessage(order: ContactOrderInfo): string {
  const firstName = order.customer_name.split(/\s+/)[0];
  const items = order.items.map((i) => `• ${i.quantity} × ${i.product_name} (${i.colour}, ${i.size})`).join('\n');
  return (
    `Hi ${firstName}, this is ${environment.brandName} 👋\n\n` +
    `Thanks for your order ${order.order_number}:\n${items}\n\n` +
    `Total: QAR ${Number(order.grand_total).toFixed(2)} (cash on delivery)\n` +
    `Delivery area: ${order.delivery_area}\n\n` +
    `Can you confirm the order and your delivery address? Thank you!`
  );
}

export function whatsappLink(e164: string, message: string): string | null {
  const number = whatsappNumber(e164);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}
