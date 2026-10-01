export interface CartItem {
  id: string;
  name: string;
  priceMinor: number; // Price in minor units (e.g., cents, qəpik)
  quantity: number;
}

export class Cart {
  private items: Map<string, CartItem> = new Map();

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
    } else {
      existing.quantity -= quantity;
    }
  }

  /**
   * Clears all items from the cart.
   */
  clear(): void {
    this.items.clear();
  }

  /**
   * Returns all items in the cart.
   */
  getItems(): CartItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Calculates the total price in minor units.
   */
  getTotalMinor(): number {
    let total = 0;
    for (const item of this.items.values()) {
      total += item.priceMinor * item.quantity;
    }
    return total;
  }
}
