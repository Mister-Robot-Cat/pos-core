import { describe, it, expect, beforeEach } from 'vitest';
import { Cart } from '../src/cart.js';

describe('Cart', () => {
  let cart: Cart;

  beforeEach(() => {
    cart = new Cart();
  });

  it('should add an item with default quantity 1', () => {
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 450 });
    expect(cart.getItems()).toHaveLength(1);
    expect(cart.getItems()[0]).toEqual({
      id: '1',
      name: 'Coffee',
      priceMinor: 450,
      quantity: 1,
    });
  });

  it('should increment quantity if item already exists', () => {
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 450, quantity: 2 });
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 450, quantity: 3 });
    expect(cart.getItems()[0].quantity).toBe(5);
  });

  it('should correctly calculate total in minor units', () => {
    cart.addItem({ id: '1', name: 'Espresso', priceMinor: 250, quantity: 2 }); // 500
    cart.addItem({ id: '2', name: 'Latte', priceMinor: 450, quantity: 1 });    // 450
    expect(cart.getTotalMinor()).toBe(950);
  });

  it('should remove an item completely if no quantity specified', () => {
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 450, quantity: 2 });
    cart.removeItem('1');
    expect(cart.getItems()).toHaveLength(0);
  });

  it('should decrement quantity if quantity specified', () => {
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 450, quantity: 5 });
    cart.removeItem('1', 2);
    expect(cart.getItems()[0].quantity).toBe(3);
  });

  it('should clear all items', () => {
    cart.addItem({ id: '1', name: 'Coffee', priceMinor: 450 });
    cart.addItem({ id: '2', name: 'Tea', priceMinor: 300 });
    cart.clear();
    expect(cart.getItems()).toHaveLength(0);
    expect(cart.getTotalMinor()).toBe(0);
  });
});
