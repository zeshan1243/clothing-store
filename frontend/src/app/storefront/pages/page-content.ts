/**
 * Static page copy. DRAFT TEXT: every policy here must be reviewed against the registered business
 * and applicable Qatar requirements before launch (see claude.md §4.6).
 */
export interface StaticPage {
  title: string;
  description: string;
  sections: { heading?: string; paragraphs: string[] }[];
}

export const STATIC_PAGES: Record<string, StaticPage> = {
  about: {
    title: 'About us',
    description: 'A streetwear brand made in and for Doha.',
    sections: [
      {
        paragraphs: [
          'We are three founders building a streetwear label for Doha — heavyweight fabrics, relaxed fits and designs inspired by the city.',
          'Every order is packed and delivered by us personally. If you have a question, reach out any time.',
        ],
      },
    ],
  },
  contact: {
    title: 'Contact us',
    description: 'Get in touch about orders, sizing or delivery.',
    sections: [
      {
        paragraphs: [
          'WhatsApp / phone: +974 0000 0000 (update before launch)',
          'Email: hello@example.com (update before launch)',
          'Instagram: @brandname',
          'We reply between 10:00 and 22:00, Saturday to Thursday.',
        ],
      },
    ],
  },
  delivery: {
    title: 'Delivery policy',
    description: 'How and when we deliver across Qatar.',
    sections: [
      {
        heading: 'Where we deliver',
        paragraphs: ['We deliver anywhere in Qatar with our own team. Choose your area at checkout.'],
      },
      {
        heading: 'Confirmation',
        paragraphs: [
          'After you place an order we will call or WhatsApp you to confirm the details. Orders are dispatched only after confirmation.',
        ],
      },
      {
        heading: 'Delivery time and fee',
        paragraphs: [
          'Delivery is free in Doha and the Al Rayyan suburbs. Elsewhere in Qatar the fee is QAR 10 plus QAR 1 for every 5 km from central Doha (for example Al Khor, about 50 km, is QAR 20). The exact fee is shown at checkout before you place your order.',
          'Most orders are delivered within 1–3 working days of confirmation; farther areas may take a little longer.',
        ],
      },
      {
        heading: 'Payment',
        paragraphs: ['Cash on delivery only. Please have the exact amount ready if possible.'],
      },
    ],
  },
  returns: {
    title: 'Returns & exchanges',
    description: 'Our returns and exchanges policy.',
    sections: [
      {
        paragraphs: [
          'Unworn, unwashed items with original tags can be exchanged or returned within 7 days of delivery.',
          'Contact us to arrange an exchange or return. Delivery fees are non-refundable unless the item is faulty or incorrect.',
          'Refunds are made in cash or by bank transfer once we receive and inspect the item.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    description: 'How we collect and use your personal information.',
    sections: [
      {
        heading: 'What we collect',
        paragraphs: [
          'When you place an order we collect your name, phone number, delivery address and (optionally) email address.',
        ],
      },
      {
        heading: 'How we use it',
        paragraphs: [
          'We use your details only to confirm, deliver and support your order. We do not sell your information.',
          'Only our founders can access customer data.',
        ],
      },
      {
        heading: 'Your choices',
        paragraphs: ['Contact us to request access to, correction of, or deletion of your personal data.'],
      },
    ],
  },
  terms: {
    title: 'Terms & conditions',
    description: 'Terms that apply when you shop with us.',
    sections: [
      {
        paragraphs: [
          'All prices are in Qatari Riyals (QAR). Orders are subject to availability and confirmation.',
          'We may cancel an order if we cannot reach you to confirm it, or if an item becomes unavailable.',
          'These terms are a draft and will be finalised before launch.',
        ],
      },
    ],
  },
  'size-guide': {
    title: 'Size guide',
    description: 'Find your size.',
    sections: [
      {
        paragraphs: [
          'Our tops are cut oversized. Each product page shows its own measurements under “Size guide”.',
          'Measurements are taken flat and doubled, in centimetres. If you are between sizes, size down for a closer fit.',
        ],
      },
    ],
  },
};
