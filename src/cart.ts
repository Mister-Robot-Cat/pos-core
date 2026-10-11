import { Discount, calculateDiscountAmount } from './discount.js';
import { TaxRate, TaxSummary, TaxLineBreakdown, calculateTaxAmount } from './tax.js';

export interface CartItem {
  id: string;
  name: string;
  priceMinor: number; // Price in minor units (e.g., cents, qəpik)
  quantity: number;
  taxRateId?: string; // Optional tax rate ID specific to this item
}

export class Cart {
  private items: Map<string, CartItem> = new Map();
  private discounts: Map<string, Discount> = new Map();
  private taxRates: Map<string, TaxRate> = new Map();
  private defaultTaxRateId?: string;

  /**
   * Adds an item to the cart or increments its quantity if it already exists.
   */
  addItem(item: Omit<CartItem, 'quantity'> & { quantity?: number }): void {
    const existing = this.items.get(item.id);
    const quantity = item.quantity ?? 1;

    if (existing) {
      existing.quantity += quantity;
      if (item.taxRateId !== undefined) {
        existing.taxRateId = item.taxRateId;
      }
    } else {
      this.items.set(item.id, {
        id: item.id,
        name: item.name,
        priceMinor: item.priceMinor,
        quantity,
        taxRateId: item.taxRateId,
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
   * Adds or updates a tax rate in the cart.
   */
  addTaxRate(rate: TaxRate): void {
    this.taxRates.set(rate.id, rate);
  }

  /**
   * Removes a tax rate by ID.
   */
  removeTaxRate(id: string): void {
    this.taxRates.delete(id);
    if (this.defaultTaxRateId === id) {
      this.defaultTaxRateId = undefined;
    }
  }

  /**
   * Returns all registered tax rates.
   */
  getTaxRates(): TaxRate[] {
    return Array.from(this.taxRates.values());
  }

  /**
   * Sets the default fallback tax rate ID for items without an explicit taxRateId.
   */
  setDefaultTaxRateId(id?: string): void {
    this.defaultTaxRateId = id;
  }

  /**
   * Returns the current default tax rate ID.
   */
  getDefaultTaxRateId(): string | undefined {
    return this.defaultTaxRateId;
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
   * Calculates a full tax breakdown across all cart items,
   * taking into account item-level and order-level discounts.
   */
  getTaxSummary(): TaxSummary {
    const emptySummary: TaxSummary = {
      breakdown: [],
      totalTaxMinor: 0,
      exclusiveTaxMinor: 0,
      inclusiveTaxMinor: 0,
    };

    if (this.items.size === 0) {
      return emptySummary;
    }

    // 1. Calculate item totals and item-level discounts
    interface ItemTaxContext {
      item: CartItem;
      itemTotalMinor: number;
      netAfterItemDiscountMinor: number;
      taxRate?: TaxRate;
    }

    const contexts: ItemTaxContext[] = [];
    let totalNetAfterItemDiscounts = 0;

    for (const item of this.items.values()) {
      const itemTotalMinor = item.priceMinor * item.quantity;
      let itemDiscount = 0;

      for (const discount of this.discounts.values()) {
        if (discount.targetItemId === item.id) {
          itemDiscount += calculateDiscountAmount(itemTotalMinor, discount);
        }
      }

      const netAfterItemDiscountMinor = Math.max(0, itemTotalMinor - itemDiscount);
      totalNetAfterItemDiscounts += netAfterItemDiscountMinor;

      const rateId = item.taxRateId ?? this.defaultTaxRateId;
      const taxRate = rateId ? this.taxRates.get(rateId) : undefined;

      contexts.push({
        item,
        itemTotalMinor,
        netAfterItemDiscountMinor,
        taxRate,
      });
    }

    // 2. Calculate cart-level discounts
    let cartDiscountTotal = 0;
    for (const discount of this.discounts.values()) {
      if (!discount.targetItemId) {
        cartDiscountTotal += calculateDiscountAmount(totalNetAfterItemDiscounts, discount);
      }
    }
    const effectiveCartDiscount = Math.min(totalNetAfterItemDiscounts, cartDiscountTotal);

    // 3. Apportion cart discounts to items and calculate taxes per rate
    const breakdownMap = new Map<string, TaxLineBreakdown>();

    for (const ctx of contexts) {
      if (!ctx.taxRate || ctx.taxRate.ratePercent <= 0) {
        continue;
      }

      let taxableBaseMinor = ctx.netAfterItemDiscountMinor;
      if (totalNetAfterItemDiscounts > 0 && effectiveCartDiscount > 0) {
        const ratio = (totalNetAfterItemDiscounts - effectiveCartDiscount) / totalNetAfterItemDiscounts;
        taxableBaseMinor = Math.round(ctx.netAfterItemDiscountMinor * ratio);
      }

      if (taxableBaseMinor <= 0) {
        continue;
      }

      const isInclusive = Boolean(ctx.taxRate.isInclusive);
      const taxAmountMinor = calculateTaxAmount(
        taxableBaseMinor,
        ctx.taxRate.ratePercent,
        isInclusive
      );

      const existing = breakdownMap.get(ctx.taxRate.id);
      if (existing) {
        existing.taxableBaseMinor += taxableBaseMinor;
        existing.taxAmountMinor += taxAmountMinor;
      } else {
        breakdownMap.set(ctx.taxRate.id, {
          taxRateId: ctx.taxRate.id,
          name: ctx.taxRate.name,
          ratePercent: ctx.taxRate.ratePercent,
          isInclusive,
          taxableBaseMinor,
          taxAmountMinor,
        });
      }
    }

    const breakdown = Array.from(breakdownMap.values());
    let totalTaxMinor = 0;
    let exclusiveTaxMinor = 0;
    let inclusiveTaxMinor = 0;

    for (const line of breakdown) {
      totalTaxMinor += line.taxAmountMinor;
      if (line.isInclusive) {
        inclusiveTaxMinor += line.taxAmountMinor;
      } else {
        exclusiveTaxMinor += line.taxAmountMinor;
      }
    }

    return {
      breakdown,
      totalTaxMinor,
      exclusiveTaxMinor,
      inclusiveTaxMinor,
    };
  }

  /**
   * Calculates the final total price after discounts and exclusive taxes in minor units.
   */
  getTotalMinor(): number {
    const subtotal = this.getSubtotalMinor();
    const discount = this.getDiscountTotalMinor();
    const discounted = Math.max(0, subtotal - discount);
    const { exclusiveTaxMinor } = this.getTaxSummary();
    return discounted + exclusiveTaxMinor;
  }
}
