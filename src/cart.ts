import { Discount, calculateDiscountAmount } from './discount.js';

export interface CartItem {
  id: string;
  name: string;
  priceMinor: number; // Price in minor units (e.g., cents, qəpik)
  quantity: number;
}

export class Cart {
  private items: Map<string, CartItem> = new Map();
  private discounts: Map<string, Discount> = new Map();

  /**
   * Adds an item to the cart or increments its quantity if it already exists.
   */
  addItem(item: Omit<CartItem, 'quantity'> & { quantity?: number }): void {
    const existing = this.items.get(item.id);
    const quantity = item.quantity ?? 1;

    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.set(item.id, {
        id: item.id,
        name: item.name,
        priceMinor: item.priceMinor,
        quantity,
      });
    }
  }

  /**
   * Removes a specific quantity of an item from the cart.
   * If quantity is not provided, removes the item completely.
   */
  removeItem(id: string, quantity?: number): void {
    const existing = this.items.get(id);
    if (!existing) return;

    if (quantity === undefined || existing.quantity <= quantity) {
      this.items.delete(id);
      for (const [discountId, discount] of this.discounts.entries()) {
        if (discount.targetItemId === id) {
          this.discounts.delete(discountId);
        }
      }
    } else {
      existing.quantity -= quantity;
    }
  }

  /**
   * Clears all items and discounts from the cart.
   */
  clear(): void {
    this.items.clear();
    this.discounts.clear();
  }

  /**
   * Returns all items in the cart.
   */
  getItems(): CartItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Adds or updates a discount on the cart.
   */
  applyDiscount(discount: Discount): void {
    this.discounts.set(discount.id, discount);
  }

  /**
   * Removes a discount by ID.
   */
  removeDiscount(id: string): void {
    this.discounts.delete(id);
  }

  /**
   * Returns all active discounts.
   */
  getDiscounts(): Discount[] {
    return Array.from(this.discounts.values());
  }

  /**
   * Calculates subtotal of all items before discounts in minor units.
   */
  getSubtotalMinor(): number {
    let subtotal = 0;
    for (const item of this.items.values()) {
      subtotal += item.priceMinor * item.quantity;
    }
    return subtotal;
  }

  /**
   * Calculates the total discount amount applied across items and cart.
   */
  getDiscountTotalMinor(): number {
    const subtotal = this.getSubtotalMinor();
    if (subtotal === 0 || this.discounts.size === 0) {
      return 0;
    }

    let totalDiscount = 0;

    // Apply item-specific discounts first
    for (const discount of this.discounts.values()) {
      if (discount.targetItemId) {
        const item = this.items.get(discount.targetItemId);
        if (item) {
          const itemTotal = item.priceMinor * item.quantity;
          totalDiscount += calculateDiscountAmount(itemTotal, discount);
        }
      }
    }

    // Apply order/cart-level discounts on remaining balance
    const remaining = Math.max(0, subtotal - totalDiscount);
    let cartDiscount = 0;
    for (const discount of this.discounts.values()) {
      if (!discount.targetItemId) {
        cartDiscount += calculateDiscountAmount(remaining, discount);
      }
    }

    totalDiscount += Math.min(remaining, cartDiscount);
    return Math.min(subtotal, totalDiscount);
  }

  /**
   * Calculates the final total price after discounts in minor units.
   */
  getTotalMinor(): number {
    const subtotal = this.getSubtotalMinor();
    const discount = this.getDiscountTotalMinor();
    return Math.max(0, subtotal - discount);
  }
}
