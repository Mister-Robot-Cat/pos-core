import { describe, it, expect, beforeEach } from 'vitest';
import { Cart } from '../src/cart.js';
import {
  PaymentSession,
  roundCashAmount,
  PaymentTender,
} from '../src/payment.js';

describe('roundCashAmount', () => {
  it('returns original amount when interval is 0 or 1', () => {
    expect(roundCashAmount(123, 1)).toBe(123);
    expect(roundCashAmount(123, 0)).toBe(123);
    expect(roundCashAmount(0, 5)).toBe(0);
  });

  it('rounds to nearest interval by default', () => {
    // 5-cent rounding
    expect(roundCashAmount(121, 5)).toBe(120);
    expect(roundCashAmount(122, 5)).toBe(120);
    expect(roundCashAmount(123, 5)).toBe(125);
    expect(roundCashAmount(124, 5)).toBe(125);
    expect(roundCashAmount(125, 5)).toBe(125);
    expect(roundCashAmount(127, 5)).toBe(125);
    expect(roundCashAmount(128, 5)).toBe(130);
  });

  it('handles negative amounts correctly', () => {
    expect(roundCashAmount(-122, 5)).toBe(-120);
    expect(roundCashAmount(-123, 5)).toBe(-125);
  });

  it('rounds down when direction is down', () => {
    expect(roundCashAmount(124, 5, 'down')).toBe(120);
    expect(roundCashAmount(128, 5, 'down')).toBe(125);
    expect(roundCashAmount(125, 5, 'down')).toBe(125);
  });

  it('rounds up when direction is up', () => {
    expect(roundCashAmount(121, 5, 'up')).toBe(125);
    expect(roundCashAmount(126, 5, 'up')).toBe(130);
    expect(roundCashAmount(125, 5, 'up')).toBe(125);
  });

  it('supports 10-cent rounding interval', () => {
    expect(roundCashAmount(104, 10)).toBe(100);
    expect(roundCashAmount(105, 10)).toBe(110);
    expect(roundCashAmount(109, 10)).toBe(110);
  });
});

describe('PaymentSession', () => {
  it('initializes with unpaid status for positive total', () => {
    const session = new PaymentSession(5000);
    expect(session.getOriginalDueMinor()).toBe(5000);
    expect(session.getTotalDueMinor()).toBe(5000);
    expect(session.getRemainingDueMinor()).toBe(5000);
    expect(session.getTotalAppliedMinor()).toBe(0);
    expect(session.getChangeDueMinor()).toBe(0);
    expect(session.isSettled()).toBe(false);

    const summary = session.getSummary();
    expect(summary.status).toBe('unpaid');
    expect(summary.isSettled).toBe(false);
  });

  it('initializes as paid and settled when total is 0', () => {
    const session = new PaymentSession(0);
    expect(session.getRemainingDueMinor()).toBe(0);
    expect(session.isSettled()).toBe(true);

    const summary = session.getSummary();
    expect(summary.status).toBe('paid');
    expect(summary.isSettled).toBe(true);
  });

  it('processes exact card payment', () => {
    const session = new PaymentSession(4500);
    const tender = session.addTender({
      method: 'card',
      amountMinor: 4500,
      reference: 'AUTH-123456',
    });

    expect(tender.amountMinor).toBe(4500);
    expect(tender.changeMinor).toBe(0);
    expect(session.getRemainingDueMinor()).toBe(0);
    expect(session.isSettled()).toBe(true);

    const summary = session.getSummary();
    expect(summary.status).toBe('paid');
    expect(summary.totalAppliedMinor).toBe(4500);
    expect(summary.totalTenderedMinor).toBe(4500);
    expect(summary.changeDueMinor).toBe(0);
  });

  it('processes cash payment with change', () => {
    const session = new PaymentSession(3250);
    const tender = session.addTender({
      method: 'cash',
      amountMinor: 3250,
      tenderedMinor: 5000,
    });

    expect(tender.amountMinor).toBe(3250);
    expect(tender.tenderedMinor).toBe(5000);
    expect(tender.changeMinor).toBe(1750);
    expect(session.getRemainingDueMinor()).toBe(0);
    expect(session.getChangeDueMinor()).toBe(1750);
    expect(session.isSettled()).toBe(true);
  });

  it('convenience addCashTender calculates change automatically', () => {
    const session = new PaymentSession(1600);
    const tender = session.addCashTender(2000, { reference: 'CASHIER-1' });

    expect(tender.amountMinor).toBe(1600);
    expect(tender.tenderedMinor).toBe(2000);
    expect(tender.changeMinor).toBe(400);
    expect(tender.reference).toBe('CASHIER-1');
    expect(session.isSettled()).toBe(true);
  });

  it('supports split tenders across multiple payment methods', () => {
    const session = new PaymentSession(10000);

    // 1. Pay 3000 with Gift Card
    session.addTender({
      method: 'gift_card',
      amountMinor: 3000,
      reference: 'GIFT-999',
    });
    expect(session.getRemainingDueMinor()).toBe(7000);
    expect(session.getSummary().status).toBe('partially_paid');

    // 2. Pay 4000 with Card
    session.addTender({
      method: 'card',
      amountMinor: 4000,
      reference: 'VISA-4421',
    });
    expect(session.getRemainingDueMinor()).toBe(3000);
    expect(session.getSummary().status).toBe('partially_paid');

    // 3. Pay remaining 3000 with 5000 cash
    const cashTender = session.addCashTender(5000);
    expect(cashTender.amountMinor).toBe(3000);
    expect(cashTender.changeMinor).toBe(2000);

    expect(session.getRemainingDueMinor()).toBe(0);
    expect(session.getChangeDueMinor()).toBe(2000);
    expect(session.getTotalAppliedMinor()).toBe(10000);
    expect(session.getTotalTenderedMinor()).toBe(12000);
    expect(session.isSettled()).toBe(true);
    expect(session.getSummary().status).toBe('paid');
  });

  it('prevents non-cash overpayment by default', () => {
    const session = new PaymentSession(2000);
    expect(() => {
      session.addTender({
        method: 'card',
        amountMinor: 2500,
      });
    }).toThrow(/Non-cash tender of 2500 exceeds remaining balance of 2000/);
  });

  it('allows non-cash overpayment when option enabled', () => {
    const session = new PaymentSession(2000, { allowNonCashOverpayment: true });
    session.addTender({
      method: 'card',
      amountMinor: 2500,
    });
    expect(session.getTotalAppliedMinor()).toBe(2500);
    expect(session.getSummary().status).toBe('overpaid');
  });

  it('rejects invalid tender amounts', () => {
    const session = new PaymentSession(1000);

    expect(() => {
      session.addTender({ method: 'cash', amountMinor: 0 });
    }).toThrow('Tender amount must be greater than zero');

    expect(() => {
      session.addTender({ method: 'cash', amountMinor: -500 });
    }).toThrow('Tender amount must be greater than zero');

    expect(() => {
      session.addCashTender(0);
    }).toThrow('Cash tendered amount must be greater than zero');

    expect(() => {
      session.addTender({ method: 'cash', amountMinor: 1000, tenderedMinor: 800 });
    }).toThrow('tenderedMinor cannot be less than amountMinor');
  });

  it('rejects duplicate tender IDs', () => {
    const session = new PaymentSession(2000);
    session.addTender({ id: 't1', method: 'cash', amountMinor: 500 });
    expect(() => {
      session.addTender({ id: 't1', method: 'cash', amountMinor: 500 });
    }).toThrow(/already exists/);
  });

  it('allows removing a tender and restoring balance', () => {
    const session = new PaymentSession(5000);
    const tender = session.addTender({ method: 'card', amountMinor: 2000 });
    expect(session.getRemainingDueMinor()).toBe(3000);

    const removed = session.removeTender(tender.id);
    expect(removed).toBe(true);
    expect(session.getRemainingDueMinor()).toBe(5000);
    expect(session.getTenders()).toHaveLength(0);
  });

  it('clears all tenders', () => {
    const session = new PaymentSession(5000);
    session.addTender({ method: 'cash', amountMinor: 1000 });
    session.addTender({ method: 'card', amountMinor: 2000 });
    expect(session.getTenders()).toHaveLength(2);

    session.clearTenders();
    expect(session.getTenders()).toHaveLength(0);
    expect(session.getRemainingDueMinor()).toBe(5000);
  });

  it('applies cash rounding and calculates adjustment', () => {
    // Total is 102 cents. 5-cent interval rounds to 100.
    const session = new PaymentSession(102, {
      cashRounding: { intervalMinor: 5, direction: 'nearest' },
    });

    expect(session.getOriginalDueMinor()).toBe(102);
    expect(session.getTotalDueMinor()).toBe(100);
    expect(session.getCashRoundingAdjustmentMinor()).toBe(-2);
    expect(session.getRemainingDueMinor()).toBe(100);

    session.addCashTender(100);
    expect(session.isSettled()).toBe(true);

    const summary = session.getSummary();
    expect(summary.cashRoundingAdjustmentMinor).toBe(-2);
    expect(summary.totalDueMinor).toBe(100);
    expect(summary.originalDueMinor).toBe(102);
  });

  it('applies cash rounding upwards when due amount rounds up', () => {
    // Total is 103 cents. 5-cent interval rounds to 105.
    const session = new PaymentSession(103, {
      cashRounding: { intervalMinor: 5, direction: 'nearest' },
    });

    expect(session.getTotalDueMinor()).toBe(105);
    expect(session.getCashRoundingAdjustmentMinor()).toBe(2);

    session.addCashTender(105);
    expect(session.isSettled()).toBe(true);
  });
});

describe('Cart Payment Integration', () => {
  let cart: Cart;

  beforeEach(() => {
    cart = new Cart();
  });

  it('creates payment session initialized from cart total', () => {
    cart.addItem({ id: 'item-1', name: 'Coffee', priceMinor: 450, quantity: 2 }); // 900
    cart.addItem({ id: 'item-2', name: 'Muffin', priceMinor: 350, quantity: 1 }); // 350
    // Total: 1250

    const payment = cart.createPaymentSession();
    expect(payment.getTotalDueMinor()).toBe(1250);
    expect(payment.getRemainingDueMinor()).toBe(1250);

    payment.addCashTender(1500);
    expect(payment.isSettled()).toBe(true);
    expect(payment.getChangeDueMinor()).toBe(250);
  });

  it('creates payment session respecting cart discounts and taxes', () => {
    cart.addItem({ id: 'book', name: 'Novel', priceMinor: 2000, quantity: 1 });
    // Add 10% discount -> 1800
    cart.applyDiscount({
      id: 'd1',
      name: '10% off',
      type: 'percentage',
      value: 10,
    });
    // Add 10% exclusive tax on 1800 -> 180 -> Total 1980
    cart.addTaxRate({
      id: 'tax',
      name: 'Sales Tax 10%',
      ratePercent: 10,
      isInclusive: false,
    });
    cart.setDefaultTaxRateId('tax');

    expect(cart.getTotalMinor()).toBe(1980);

    const session = cart.createPaymentSession({
      cashRounding: { intervalMinor: 5, direction: 'nearest' },
    });

    // 1980 is already divisible by 5
    expect(session.getTotalDueMinor()).toBe(1980);

    session.addTender({ method: 'card', amountMinor: 1000 });
    expect(session.getRemainingDueMinor()).toBe(980);

    session.addCashTender(1000);
    expect(session.isSettled()).toBe(true);
    expect(session.getChangeDueMinor()).toBe(20);
  });
});
