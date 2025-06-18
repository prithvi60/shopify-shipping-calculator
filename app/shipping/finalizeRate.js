// Finalize rate by calculating total weight, volumetric weight, fees, VAT
export function finalizeRate({ cartItems, containerPlan, dryIcePlan, transitDays, courier }) {
  let realWeight = 0;
  let totalVolume = 0;

  for (const item of cartItems) {
    realWeight += item.weight * item.quantity;
  }

  for (const category of Object.keys(containerPlan)) {
    for (const container of containerPlan[category]) {
      realWeight += container.weight;
      totalVolume += container.volume;
    }

    if (dryIcePlan[category]) {
      for (const d of dryIcePlan[category]) {
        realWeight += d.dryIceKg;
        totalVolume += d.dryIceVolume;
      }
    }
  }

  const volumetricWeight = totalVolume / 0.005; // Shopify's 5000 cm³/kg
  const shippingWeight = Math.max(realWeight, volumetricWeight);

  // Courier base rate logic placeholder
  const baseRate = 10 + (shippingWeight * 1.2); // example logic

  // VAT
  const vat = baseRate * 0.22;

  return {
    total: baseRate + vat,
    vat,
    description: `${courier} | ${shippingWeight.toFixed(2)} kg | includes 22% VAT`
  };
}
