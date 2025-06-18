import { json } from "@remix-run/node";
import { calculateVolume } from "../shipping/calculateVolume.js";
import { selectContainers } from "../shipping/selectContainers.js";
import { computeDryIce } from "../shipping/computeDryIce.js";
import { finalizeRate } from "../shipping/finalizeRate.js";


// Shopify calls this during checkout
export const action = async ({ request }) => {
  const cartData = await request.json();

  const cartItems = cartData.rate.items.map(item => ({
    quantity: item.quantity,
    dimensions: {
      length: parseFloat(item.properties?.length || 0),
      width: parseFloat(item.properties?.width || 0),
      height: parseFloat(item.properties?.height || 0),
    },
    weight: parseFloat(item.grams || 0) / 1000, // grams to kg
    category: item.properties?.category?.toLowerCase() || "ambient", // 'fresh', 'frozen', 'ambient'
  }));

  // Step 1: Volume calculation
  const volumeByCategory = calculateVolume(cartItems);

  // ✅ Mock container data
  const availableContainers = [
    {
      id: "box_small",
      name: "Small Box",
      volume: 0.03,  // in m³
      weight: 0.5,
      cost_excl_vat: 3.5,
      cost_incl_vat: 4.3
    },
    {
      id: "box_medium",
      name: "Medium Box",
      volume: 0.06,
      weight: 0.8,
      cost_excl_vat: 5.5,
      cost_incl_vat: 6.7
    },
    {
      id: "box_large",
      name: "Large Box",
      volume: 0.09,
      weight: 1.2,
      cost_excl_vat: 7.0,
      cost_incl_vat: 8.5
    }
  ];

  // Step 2: Select containers
  const containerPlan = selectContainers(volumeByCategory, availableContainers);

  // Step 3: Dry ice logic
  const transitDays = 2; // Static for now
  const dryIcePlan = computeDryIce(containerPlan, transitDays);

  // Step 4–6: Finalize shipping rate
  const shippingRate = finalizeRate({
    cartItems,
    containerPlan,
    dryIcePlan,
    transitDays,
    courier: "GLS"
  });

  const rates = [
    {
      service_name: "Cold Chain Shipping",
      service_code: "COLD_EXPRESS",
      total_price: Math.round(shippingRate.total * 100), // in cents
      currency: "EUR",
      description: shippingRate.description,
    },
  ];

  return json({ rates });
};
