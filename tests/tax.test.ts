import { describe, it, expect, beforeEach } from 'vitest';
import { Cart } from '../src/cart.js';
import { calculateTaxAmount, TaxRate } from '../src/tax.js';

describe('calculateTaxAmount', () => {
  it('returns 0 when base amount is zero or negative', () => {
    expect(calculateTaxAmount(0, 18)).toBe(0);
    expect(calculateTaxAmount(-500, 18)).toBe(0);
  });

  it('returns 0 when rate percent is zero or negative', () => {
    expect(calculateTaxAmount(1000, 0)).toBe(0);
    expect(calculateTaxAmount(1000, -5)).toBe(0);
  });

  it('calculates exclusive tax correctly', () => {
    // 1000 minor @ 10% = 100
    expect(calculateTaxAmount(1000, 10, false)).toBe(100);
    // 1000 minor @ 18% = 180
    expect(calculateTaxAmount(1000, 18, false)).toBe(180);
    // 333 minor @ 10% = 33.3 -> rounded to 33
    expect(calculateTaxAmount(333, 10, false)).toBe(33);
  });

  it('calculates inclusive tax correctly', () => {
    // 1180 minor gross @ 18% inclusive = 180 tax (net is 1000)
    expect(calculateTaxAmount(1180, 18, true)).toBe(180);
    // 1200 minor gross @ 20% inclusive = 200 tax (net is 1000)
    expect(calculateTaxAmount(1200, 20, true)).toBe(200);
    // 590 minor gross @ 18% inclusive = 90 tax (net is 500)
    expect(calculateTaxAmount(590, 18, true)).toBe(90);
  });
});

describe('Cart Tax Integration', () => {
  let cart: Cart;

  const vat18: TaxRate = {
    id: 'vat-18',
    name: 'Standard VAT 18%',
    ratePercent: 18,
    isInclusive: true,
  };

  const salesTax10: TaxRate = {
    id: 'sales-10',
    name: 'Sales Tax 10%',
    ratePercent: 10,
    isInclusive: false,
  };

  const reduced8: TaxRate = {
    id: 'vat-8',
    name: 'Reduced VAT 8%',
    ratePercent: 8,
    isInclusive: true,
  };

  beforeEach(() => {
    cart = new Cart();
  });

  it('allows registering, listing, and removing tax rates', () => {
    cart.addTaxRate(vat18);
    cart.addTaxRate(salesTax10);

    expect(cart.getTaxRates()).toHaveLength(2);

    cart.setDefaultTaxRateId('vat-18');
    expect(cart.getDefaultTaxRateId()).toBe('vat-18');

    cart.removeTaxRate('vat-18');
    expect(cart.getTaxRates()).toHaveLength(1);
    expect(cart.getDefaultTaxRateId()).toBeUndefined();
  });

  it('returns empty tax summary when cart is empty', () => {
    cart.addTaxRate(vat18);
    const summary = cart.getTaxSummary();
    expect(summary.breakdown).toEqual([]);
    expect(summary.totalTaxMinor).toBe(0);
    expect(summary.exclusiveTaxMinor).toBe(0);
    expect(summary.inclusiveTaxMinor).toBe(0);
  });

  it('returns empty tax breakdown when no items have tax rates', () => {
    cart.addItem({ id: '1', name: 'Item', priceMinor: 1000, quantity: 1 });
    const summary = cart.getTaxSummary();
    expect(summary.breakdown).toEqual([]);
    expect(summary.totalTaxMinor).toBe(0);
    expect(cart.getTotalMinor()).toBe(1000);
  });

  it('calculates exclusive tax using default tax rate', () => {
    cart.addTaxRate(salesTax10);
    cart.setDefaultTaxRateId('sales-10');

    cart.addItem({ id: '1', name: 'Shirt', priceMinor: 2000, quantity: 2 }); // 4000 total

    const summary = cart.getTaxSummary();
    expect(summary.breakdown).toHaveLength(1);
    expect(summary.breakdown[0]).toEqual({
      taxRateId: 'sales-10',
      name: 'Sales Tax 10%',
      ratePercent: 10,
      isInclusive: false,
      taxableBaseMinor: 4000,
      taxAmountMinor: 400,
    });
    expect(summary.totalTaxMinor).toBe(400);
    expect(summary.exclusiveTaxMinor).toBe(400);
    expect(summary.inclusiveTaxMinor).toBe(0);

    // Total should be subtotal (4000) + exclusive tax (400) = 4400
    expect(cart.getTotalMinor()).toBe(4400);
  });

  it('calculates inclusive tax without increasing the cart total', () => {
    cart.addTaxRate(vat18);
    cart.setDefaultTaxRateId('vat-18');

    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 1180, quantity: 1 });

    const summary = cart.getTaxSummary();
    expect(summary.breakdown).toHaveLength(1);
    expect(summary.breakdown[0]).toEqual({
      taxRateId: 'vat-18',
      name: 'Standard VAT 18%',
      ratePercent: 18,
      isInclusive: true,
      taxableBaseMinor: 1180,
      taxAmountMinor: 180,
    });
    expect(summary.totalTaxMinor).toBe(180);
    expect(summary.exclusiveTaxMinor).toBe(0);
    expect(summary.inclusiveTaxMinor).toBe(180);

    // Total should remain 1180 because VAT is already included
    expect(cart.getTotalMinor()).toBe(1180);
  });

  it('supports per-item tax rates overriding default tax rate', () => {
    cart.addTaxRate(vat18);
    cart.addTaxRate(reduced8);
    cart.setDefaultTaxRateId('vat-18');

    cart.addItem({ id: '1', name: 'Standard Good', priceMinor: 1180, quantity: 1 });
    cart.addItem({ id: '2', name: 'Book', priceMinor: 1080, quantity: 1, taxRateId: 'vat-8' });

    const summary = cart.getTaxSummary();
    expect(summary.breakdown).toHaveLength(2);

    const standardLine = summary.breakdown.find(b => b.taxRateId === 'vat-18');
    const reducedLine = summary.breakdown.find(b => b.taxRateId === 'vat-8');

    expect(standardLine?.taxAmountMinor).toBe(180);
    expect(reducedLine?.taxAmountMinor).toBe(80);
    expect(summary.totalTaxMinor).toBe(260);
    expect(cart.getTotalMinor()).toBe(2260);
  });

  it('re-calculates taxable base after item-specific discount', () => {
    cart.addTaxRate(salesTax10);

    cart.addItem({ id: '1', name: 'Headphones', priceMinor: 10000, quantity: 1, taxRateId: 'sales-10' });

    // 20% discount on headphones -> 2000 minor off, taxable base becomes 8000
    cart.applyDiscount({
      id: 'disc-1',
      name: '20% off',
      type: 'percentage',
      value: 20,
      targetItemId: '1',
    });

    const summary = cart.getTaxSummary();
    expect(summary.breakdown[0].taxableBaseMinor).toBe(8000);
    expect(summary.breakdown[0].taxAmountMinor).toBe(800); // 10% of 8000
    expect(summary.totalTaxMinor).toBe(800);

    // Total = (10000 - 2000) + 800 = 8800
    expect(cart.getTotalMinor()).toBe(8800);
  });

  it('proportionally apportions cart-level discounts across taxable items', () => {
    cart.addTaxRate(salesTax10);

    // Two items: 1000 minor each. Subtotal = 2000 minor.
    cart.addItem({ id: '1', name: 'Item A', priceMinor: 1000, quantity: 1, taxRateId: 'sales-10' });
    cart.addItem({ id: '2', name: 'Item B', priceMinor: 1000, quantity: 1, taxRateId: 'sales-10' });

    // $5 (500 minor) off entire cart -> 25% discount across the cart
    cart.applyDiscount({
      id: 'cart-coupon',
      name: '$5 Off',
      type: 'fixed',
      value: 500,
    });

    const summary = cart.getTaxSummary();
    // Each item base is reduced from 1000 to 750 (total taxable base = 1500)
    expect(summary.breakdown[0].taxableBaseMinor).toBe(1500);
    expect(summary.breakdown[0].taxAmountMinor).toBe(150); // 10% of 1500
    expect(summary.totalTaxMinor).toBe(150);

    // Total = (2000 - 500) + 150 = 1650
    expect(cart.getTotalMinor()).toBe(1650);
  });

  it('combines items with the same tax rate into a single line breakdown', () => {
    cart.addTaxRate(vat18);

    cart.addItem({ id: '1', name: 'Drink A', priceMinor: 590, quantity: 2, taxRateId: 'vat-18' }); // 1180
    cart.addItem({ id: '2', name: 'Drink B', priceMinor: 1180, quantity: 1, taxRateId: 'vat-18' }); // 1180

    const summary = cart.getTaxSummary();
    expect(summary.breakdown).toHaveLength(1);
    expect(summary.breakdown[0].taxableBaseMinor).toBe(2360);
    // 2360 @ 18% inclusive = round(2360 * 18 / 118) = 360
    expect(summary.breakdown[0].taxAmountMinor).toBe(360);
    expect(cart.getTotalMinor()).toBe(2360);
  });
});
