// Calculate total volume per category from product metafields
export function calculateVolume(cartItems) {
  const volume = {
    fresh: 0,
    frozen: 0,
    ambient: 0
  };

  for (const item of cartItems) {
    const { category, dimensions, quantity } = item;

    if (!dimensions?.length || !dimensions?.width || !dimensions?.height) continue;

    const itemVolume = (dimensions.length * dimensions.width * dimensions.height) / 1e6; // cm³ to m³
    volume[category] += itemVolume * quantity;
  }

  return volume;
}
