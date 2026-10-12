export type PaymentMethod = 'cash' | 'card' | 'gift_card' | 'voucher' | 'other';

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overpaid';

export type RoundingDirection = 'nearest' | 'up' | 'down';

export interface CashRoundingConfig {
  /** Rounding interval in minor units (e.g. 5 for 5-cent rounding, 10 for 10-cent rounding) */
  intervalMinor: number;
  /** Direction to round (default: 'nearest') */
  direction?: RoundingDirection;
}

export interface PaymentTender {
  id: string;
  method: PaymentMethod;
  /** Amount credited towards the balance in minor units */
  amountMinor: number;
  /** Physical amount tendered (e.g. customer hands 5000 cents for a 3500 cent charge) */
  tenderedMinor: number;
  /** Change returned for this tender in minor units */
  changeMinor: number;
  /** Optional transaction or authorization reference code */
  reference?: string;
  /** Timestamp when payment was tendered */
  timestamp: number;
  /** Optional metadata associated with the tender */
  metadata?: Record<string, unknown>;
}

export interface PaymentSummary {
  /** Original total due before rounding */
  originalDueMinor: number;
  /** Effective total due after cash rounding adjustment */
  totalDueMinor: number;
  /** Sum of physical amounts tendered */
  totalTenderedMinor: number;
  /** Sum of amounts applied towards the bill balance */
  totalAppliedMinor: number;
  /** Remaining balance to be paid in minor units */
  remainingDueMinor: number;
  /** Total change due back to customer in minor units */
  changeDueMinor: number;
  /** Cash rounding adjustment in minor units */
  cashRoundingAdjustmentMinor: number;
  /** Payment settlement status */
  status: PaymentStatus;
  /** Whether the full balance has been settled */
  isSettled: boolean;
  /** List of applied tenders */
  tenders: PaymentTender[];
}

export interface PaymentSessionOptions {
  /** Cash rounding configuration */
  cashRounding?: CashRoundingConfig;
  /** Whether non-cash tenders (card, voucher, etc.) are allowed to exceed remaining balance. Default false. */
  allowNonCashOverpayment?: boolean;
}

/**
 * Rounds an amount in minor units according to the specified interval and direction.
 *
 * @param amountMinor Amount in minor units
 * @param intervalMinor Interval in minor units (e.g. 5, 10, 50)
 * @param direction Rounding direction ('nearest' | 'up' | 'down')
 * @returns Rounded amount in minor units
 */
export function roundCashAmount(
  amountMinor: number,
  intervalMinor: number,
  direction: RoundingDirection = 'nearest'
): number {
  if (intervalMinor <= 1 || amountMinor === 0) {
    return amountMinor;
  }

  const sign = amountMinor < 0 ? -1 : 1;
  const absAmount = Math.abs(amountMinor);

  let rounded: number;
  if (direction === 'up') {
    rounded = Math.ceil(absAmount / intervalMinor) * intervalMinor;
  } else if (direction === 'down') {
    rounded = Math.floor(absAmount / intervalMinor) * intervalMinor;
  } else {
    rounded = Math.round(absAmount / intervalMinor) * intervalMinor;
  }

  return sign * rounded;
}

export class PaymentSession {
  private readonly originalDueMinor: number;
  private readonly options: PaymentSessionOptions;
  private tenders: Map<string, PaymentTender> = new Map();
  private nextId = 1;

  constructor(totalDueMinor: number, options: PaymentSessionOptions = {}) {
    this.originalDueMinor = Math.max(0, Math.round(totalDueMinor));
    this.options = options;
  }

  /**
   * Returns the original balance due before cash rounding.
   */
  getOriginalDueMinor(): number {
    return this.originalDueMinor;
  }

  /**
   * Returns the effective total due after any applicable cash rounding.
   */
  getTotalDueMinor(): number {
    if (this.options.cashRounding && this.options.cashRounding.intervalMinor > 1) {
      return roundCashAmount(
        this.originalDueMinor,
        this.options.cashRounding.intervalMinor,
        this.options.cashRounding.direction ?? 'nearest'
      );
    }
    return this.originalDueMinor;
  }

  /**
   * Returns the rounding adjustment difference in minor units.
   */
  getCashRoundingAdjustmentMinor(): number {
    return this.getTotalDueMinor() - this.originalDueMinor;
  }

  /**
   * Returns the sum of amounts applied towards the bill balance.
   */
  getTotalAppliedMinor(): number {
    let sum = 0;
    for (const tender of this.tenders.values()) {
      sum += tender.amountMinor;
    }
    return sum;
  }

  /**
   * Returns the total physical currency tendered.
   */
  getTotalTenderedMinor(): number {
    let sum = 0;
    for (const tender of this.tenders.values()) {
      sum += tender.tenderedMinor;
    }
    return sum;
  }

  /**
   * Returns remaining unpaid balance in minor units.
   */
  getRemainingDueMinor(): number {
    const totalDue = this.getTotalDueMinor();
    const applied = this.getTotalAppliedMinor();
    return Math.max(0, totalDue - applied);
  }

  /**
   * Returns the total change due across all tenders.
   */
  getChangeDueMinor(): number {
    let totalChange = 0;
    for (const tender of this.tenders.values()) {
      totalChange += tender.changeMinor;
    }
    return totalChange;
  }

  /**
   * Whether the transaction balance has been fully settled.
   */
  isSettled(): boolean {
    return this.getRemainingDueMinor() === 0;
  }

  /**
   * Adds a tender to the session.
   */
  addTender(params: {
    id?: string;
    method: PaymentMethod;
    amountMinor: number;
    tenderedMinor?: number;
    reference?: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
  }): PaymentTender {
    const remainingDue = this.getRemainingDueMinor();

    if (params.amountMinor <= 0) {
      throw new Error('Tender amount must be greater than zero');
    }

    if (params.tenderedMinor !== undefined && params.tenderedMinor < params.amountMinor) {
      throw new Error('tenderedMinor cannot be less than amountMinor');
    }

    const id = params.id ?? `tender-${this.nextId++}`;
    if (this.tenders.has(id)) {
      throw new Error(`Tender with id "${id}" already exists`);
    }

    let appliedMinor: number;
    let tenderedMinor: number;
    let changeMinor = 0;

    if (params.method === 'cash') {
      tenderedMinor = params.tenderedMinor ?? params.amountMinor;
      // If customer handed more than remaining due, apply only what is needed and calculate change
      if (params.tenderedMinor !== undefined) {
        appliedMinor = Math.min(params.amountMinor, remainingDue);
        changeMinor = Math.max(0, tenderedMinor - appliedMinor);
      } else {
        appliedMinor = Math.min(params.amountMinor, remainingDue);
        changeMinor = Math.max(0, params.amountMinor - appliedMinor);
      }
    } else {
      tenderedMinor = params.tenderedMinor ?? params.amountMinor;
      if (!this.options.allowNonCashOverpayment && params.amountMinor > remainingDue) {
        throw new Error(
          `Non-cash tender of ${params.amountMinor} exceeds remaining balance of ${remainingDue}`
        );
      }
      appliedMinor = params.amountMinor;
      changeMinor = Math.max(0, tenderedMinor - appliedMinor);
    }

    const tender: PaymentTender = {
      id,
      method: params.method,
      amountMinor: appliedMinor,
      tenderedMinor,
      changeMinor,
      reference: params.reference,
      timestamp: params.timestamp ?? Date.now(),
      metadata: params.metadata,
    };

    this.tenders.set(id, tender);
    return tender;
  }

  /**
   * Convenience method to tender cash and automatically handle change calculation.
   */
  addCashTender(
    tenderedMinor: number,
    options?: { id?: string; reference?: string; timestamp?: number; metadata?: Record<string, unknown> }
  ): PaymentTender {
    if (tenderedMinor <= 0) {
      throw new Error('Cash tendered amount must be greater than zero');
    }

    const remaining = this.getRemainingDueMinor();
    const appliedMinor = Math.min(tenderedMinor, remaining);

    return this.addTender({
      id: options?.id,
      method: 'cash',
      amountMinor: appliedMinor > 0 ? appliedMinor : 0,
      tenderedMinor,
      reference: options?.reference,
      timestamp: options?.timestamp,
      metadata: options?.metadata,
    });
  }

  /**
   * Removes a tender by ID.
   */
  removeTender(id: string): boolean {
    return this.tenders.delete(id);
  }

  /**
   * Clears all tenders from this session.
   */
  clearTenders(): void {
    this.tenders.clear();
  }

  /**
   * Returns all active tenders in this session.
   */
  getTenders(): PaymentTender[] {
    return Array.from(this.tenders.values());
  }

  /**
   * Generates a comprehensive summary of the payment session.
   */
  getSummary(): PaymentSummary {
    const totalDueMinor = this.getTotalDueMinor();
    const totalAppliedMinor = this.getTotalAppliedMinor();
    const totalTenderedMinor = this.getTotalTenderedMinor();
    const remainingDueMinor = Math.max(0, totalDueMinor - totalAppliedMinor);
    const changeDueMinor = this.getChangeDueMinor();
    const cashRoundingAdjustmentMinor = this.getCashRoundingAdjustmentMinor();

    let status: PaymentStatus;
    if (totalAppliedMinor === 0 && totalDueMinor > 0) {
      status = 'unpaid';
    } else if (remainingDueMinor > 0) {
      status = 'partially_paid';
    } else if (totalAppliedMinor === totalDueMinor) {
      status = 'paid';
    } else {
      status = 'overpaid';
    }

    return {
      originalDueMinor: this.originalDueMinor,
      totalDueMinor,
      totalTenderedMinor,
      totalAppliedMinor,
      remainingDueMinor,
      changeDueMinor,
      cashRoundingAdjustmentMinor,
      status,
      isSettled: remainingDueMinor === 0,
      tenders: this.getTenders(),
    };
  }
}
