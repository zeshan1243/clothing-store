import { TestBed } from '@angular/core/testing';

import { CartItem, CartService, MAX_QUANTITY_PER_LINE } from './cart.service';

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    variantId: 1,
    productSlug: 'hoodie',
    productName: 'Hoodie',
    sku: 'HD-BLK-M',
    colour: 'Black',
    size: 'M',
    imageUrl: null,
    unitPrice: '19.99',
    quantity: 1,
    maxQuantity: 5,
    ...overrides,
  };
}

describe('CartService', () => {
  let cart: CartService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    cart = TestBed.inject(CartService);
  });

  it('merges lines for the same variant and caps at available stock', () => {
    cart.add(item({ quantity: 3 }));
    const inCart = cart.add(item({ quantity: 4 }));
    expect(inCart).toBe(5);
    expect(cart.items().length).toBe(1);
    expect(cart.count()).toBe(5);
  });

  it('never exceeds the per-line maximum', () => {
    cart.add(item({ quantity: 50, maxQuantity: 100 }));
    expect(cart.count()).toBe(MAX_QUANTITY_PER_LINE);
  });

  it('totals money without floating-point drift', () => {
    cart.add(item({ quantity: 3 })); // 3 × 19.99
    expect(cart.subtotal()).toBe(59.97);
    expect(cart.total()).toBe(59.97); // delivery is added by the server once an area is chosen
  });

  it('removes a line when quantity drops to zero', () => {
    cart.add(item());
    cart.setQuantity(1, 0);
    expect(cart.items()).toEqual([]);
    expect(cart.deliveryFee()).toBe(0);
  });

  it('refresh updates price and caps quantity to new stock', () => {
    cart.add(item({ quantity: 4 }));
    cart.refresh(1, '15.00', 2);
    expect(cart.items()[0].unitPrice).toBe('15.00');
    expect(cart.items()[0].quantity).toBe(2);
  });
});
