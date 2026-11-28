// Human labels for the per-product seller payment terms
// (products.payment_type: 'on_delivery' | 'escrow' | 'before_delivery').

export function paymentLabel(term: string | null): string {
  switch (term) {
    case "on_delivery":
      return "Pay on delivery";
    case "escrow":
      return "Escrow";
    case "before_delivery":
      return "Pay before delivery";
    default:
      return "Settled with seller";
  }
}
