import { describe, it, expect, beforeEach } from 'vitest';
import { Cart } from '../src/cart.js';
import { calculateDiscountAmount, Discount } from '../src/discount.js';

describe('calculateDiscountAmount', () => {
  it('should calculate standard percentage discount', () => {
    const discount: Discount = {
      id: 'pct-10',
      name: '10% Off',
      type: 'percentage',
      value: 10,
    };
    expect(calculateDiscountAmount(1000, discount)).toBe(100);
  });

  it('should correctly round percentage discounts', () => {
    const discount: Discount = {
      id: 'pct-15',
      name: '15% Off',
      type: 'percentage',
      value: 15,
    };
    // 333 * 0.15 = 49.95 -> 50
    expect(calculateDiscountAmount(333, discount)).toBe(50);
  });

  it('should respect maxDiscountMinor cap on percentage discounts', () => {
    const discount: Discount = {
      id: 'pct-50-capped',
      name: '50% Off (Max 500)',
      type: 'percentage',
      value: 50,
      maxDiscountMinor: 500,
    };
    expect(calculateDiscountAmount(2000, discount)).toBe(500);
    expect(calculateDiscountAmount(600, discount)).toBe(300);
  });

  it('should calculate fixed amount discount', () => {
    const discount: Discount = {
      id: 'fixed-200',
      name: '$2 Off',
      type: 'fixed',
      value: 200,
    };
    expect(calculateDiscountAmount(1000, discount)).toBe(200);
  });

  it('should cap discount to base amount if fixed discount exceeds base', () => {
    const discount: Discount = {
      id: 'fixed-500',
      name: '$5 Off',
      type: 'fixed',
      value: 500,
    };
    expect(calculateDiscountAmount(300, discount)).toBe(300);
  });

  it('should return 0 for non-positive amounts or discount values', () => {
    const discount: Discount = {
      id: 'zero',
      name: 'Zero',
      type: 'percentage',
      value: 0,
    };
    expect(calculateDiscountAmount(1000, discount)).toBe(0);
    expect(calculateDiscountAmount(0, { ...discount, value: 10 })).toBe(0);
    expect(calculateDiscountAmount(-100, { ...discount, value: 10 })).toBe(0);
  });
});

describe('Cart with Discounts', () => {
  let cart: Cart;

  beforeEach(() => {
    cart = new Cart();
  });

  it('should calculate subtotal without discounts', () => {
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 400, quantity: 2 });
    expect(cart.getSubtotalMinor()).toBe(800);
    expect(cart.getDiscountTotalMinor()).toBe(0);
    expect(cart.getTotalMinor()).toBe(800);
  });

  it('should apply cart-level percentage discount', () => {
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 500, quantity: 2 }); // 1000
    cart.applyDiscount({
      id: 'promo-10',
      name: '10% Off Cart',
      type: 'percentage',
      value: 10,
    });

    expect(cart.getSubtotalMinor()).toBe(1000);
    expect(cart.getDiscountTotalMinor()).toBe(100);
    expect(cart.getTotalMinor()).toBe(900);
  });

  it('should apply cart-level fixed discount', () => {
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 500, quantity: 1 });
    cart.applyDiscount({
      id: 'voucher-150',
      name: '$1.50 Off',
      type: 'fixed',
      value: 150,
    });

    expect(cart.getSubtotalMinor()).toBe(500);
    expect(cart.getDiscountTotalMinor()).toBe(150);
    expect(cart.getTotalMinor()).toBe(350);
  });

  it('should apply item-specific discount', () => {
    cart.addItem({ id: '1', name: 'Latte', priceMinor: 400, quantity: 2 }); // 800
    cart.addItem({ id: '2', name: 'Muffin', priceMinor: 250, quantity: 1 }); // 250
    cart.applyDiscount({
      id: 'latte-sale',
      name: '25% Off Latte',
      type: 'percentage',
      value: 25,
      targetItemId: '1',
    });

    expect(cart.getSubtotalMinor()).toBe(1050);
    expect(cart.getDiscountTotalMinor()).toBe(200); // 25% of 800
    expect(cart.getTotalMinor()).toBe(850);
  });

  it('should apply item-specific and cart-level discounts together', () => {
    cart.addItem({ id: '1', name: 'Item 1', priceMinor: 1000, quantity: 1 });
    // Item discount: $2.00 off
    cart.applyDiscount({
      id: 'item-disc',
      name: '$2 Off Item',
      type: 'fixed',
      value: 200,
      targetItemId: '1',
    });
    // Cart discount: 10% off remainder (10% of 800 = 80)
    cart.applyDiscount({
      id: 'cart-disc',
      name: '10% Cart',
      type: 'percentage',
      value: 10,
    });

    expect(cart.getSubtotalMinor()).toBe(1000);
    expect(cart.getDiscountTotalMinor()).toBe(280);
    expect(cart.getTotalMinor()).toBe(720);
  });

  it('should not let total drop below 0 if discounts exceed subtotal', () => {
    cart.addItem({ id: '1', name: 'Item', priceMinor: 300, quantity: 1 });
    cart.applyDiscount({
      id: 'over-disc',
      name: 'Excessive discount',
      type: 'fixed',
      value: 1000,
    });

    expect(cart.getSubtotalMinor()).toBe(300);
    expect(cart.getDiscountTotalMinor()).toBe(300);
    expect(cart.getTotalMinor()).toBe(0);
  });

  it('should allow removing an applied discount', () => {
    cart.addItem({ id: '1', name: 'Item', priceMinor: 500, quantity: 1 });
    cart.applyDiscount({
      id: 'disc-1',
      name: 'Discount 1',
      type: 'fixed',
      value: 100,
    });

    expect(cart.getTotalMinor()).toBe(400);
    cart.removeDiscount('disc-1');
    expect(cart.getTotalMinor()).toBe(500);
    expect(cart.getDiscounts()).toHaveLength(0);
  });

  it('should auto-remove item discount when the targeted item is deleted', () => {
    cart.addItem({ id: '1', name: 'Item 1', priceMinor: 400, quantity: 1 });
    cart.applyDiscount({
      id: 'disc-item-1',
      name: 'Special on Item 1',
      type: 'fixed',
      value: 100,
      targetItemId: '1',
    });

    expect(cart.getDiscounts()).toHaveLength(1);
    cart.removeItem('1');
    expect(cart.getDiscounts()).toHaveLength(0);
    expect(cart.getTotalMinor()).toBe(0);
  });

  it('should clear discounts when cart is cleared', () => {
    cart.addItem({ id: '1', name: 'Item', priceMinor: 500, quantity: 1 });
    cart.applyDiscount({
      id: 'disc-1',
      name: 'Discount',
      type: 'percentage',
      value: 10,
    });

    cart.clear();
    expect(cart.getItems()).toHaveLength(0);
    expect(cart.getDiscounts()).toHaveLength(0);
    expect(cart.getSubtotalMinor()).toBe(0);
    expect(cart.getTotalMinor()).toBe(0);
  });
});
