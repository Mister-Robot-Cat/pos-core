export type DiscountType = 'percentage' | 'fixed';

export interface Discount {
  id: string;
  name: string;
  type: DiscountType;
  /** Percentage (0-100) or fixed amount in minor units */
  value: number;
  /** Optional item id if this discount applies only to a specific item */
  targetItemId?: string;
  /** Optional cap on the total discount in minor units */
  maxDiscountMinor?: number;
}

/**
 * Calculates the discount amount in minor units for a given base amount.
 */
export function calculateDiscountAmount(
  baseAmountMinor: number,
  discount: Discount
): number {
  if (baseAmountMinor <= 0 || discount.value <= 0) {
    return 0;
  }

  let calculated = 0;

  if (discount.type === 'percentage') {
    calculated = Math.round((baseAmountMinor * discount.value) / 100);
    if (discount.maxDiscountMinor !== undefined && discount.maxDiscountMinor >= 0) {
      calculated = Math.min(calculated, discount.maxDiscountMinor);
    }
  } else if (discount.type === 'fixed') {
    calculated = Math.round(discount.value);
  }

  return Math.min(baseAmountMinor, Math.max(0, calculated));
}
