export interface TaxRate {
  id: string;
  name: string;
  /** Tax percentage (e.g. 18 for 18%) */
  ratePercent: number;
  /** Whether the tax is already included in the item retail price */
  isInclusive?: boolean;
}

export interface TaxLineBreakdown {
  taxRateId: string;
  name: string;
  ratePercent: number;
  isInclusive: boolean;
  taxableBaseMinor: number;
  taxAmountMinor: number;
}

export interface TaxSummary {
  breakdown: TaxLineBreakdown[];
  totalTaxMinor: number;
  exclusiveTaxMinor: number;
  inclusiveTaxMinor: number;
}

/**
 * Calculates the tax amount in minor units for a given base amount and rate percentage.
 *
 * @param baseAmountMinor Base amount in minor units (e.g. cents, qəpik)
 * @param ratePercent Tax rate percentage (e.g. 18 for 18%)
 * @param isInclusive Whether the base amount already includes tax
 * @returns Calculated tax amount in minor units
 */
export function calculateTaxAmount(
  baseAmountMinor: number,
  ratePercent: number,
  isInclusive = false
): number {
  if (baseAmountMinor <= 0 || ratePercent <= 0) {
    return 0;
  }

  if (isInclusive) {
    // Formula: gross - (gross / (1 + rate / 100)) = (gross * rate) / (100 + rate)
    return Math.round((baseAmountMinor * ratePercent) / (100 + ratePercent));
  }

  // Exclusive formula: net * (rate / 100)
  return Math.round((baseAmountMinor * ratePercent) / 100);
}
