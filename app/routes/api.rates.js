import { json } from "@remix-run/node";
import { calculateVolume } from "../shipping/calculateVolume.js";
import { selectContainers } from "../shipping/selectContainers.js";
import { computeDryIce } from "../shipping/computeDryIce.js";
import { finalizeRate } from "../shipping/finalizeRate.js";
import { authenticate } from "../shopify.server.js";
console.log("✅ api.rates.js loaded");
function formatGID(variantId) {
  return `gid://shopify/ProductVariant/${variantId}`;
}

export const action = async ({ request }) => {
  console.log("✅ /api/rates called by Shopify");
  const body = await request.json();
  const items = body?.rate?.items || [];

  console.log("🔔 Incoming Shopify Checkout Payload:", JSON.stringify(body, null, 2));

  const { admin } = await authenticate.admin(request);
  const cartItems = [];

  for (const item of items) {
    const gid = formatGID(item.variant_id);
    console.log("🔍 Fetching metafields for variant:", gid);

    const metafieldQuery = `
      query GetVariantMetafields($id: ID!) {
        productVariant(id: $id) {
          product {
            metafields(first: 10, namespace: "shipping") {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
        }
      }`;

    const response = await admin.graphql(metafieldQuery, { variables: { id: gid } });
    const data = await response.json();

    const metafields = {};
    for (const edge of data?.data?.productVariant?.product?.metafields?.edges || []) {
      metafields[edge.node.key] = edge.node.value;
    }

    console.log("📦 Metafields loaded:", metafields);

    cartItems.push({
      quantity: item.quantity,
      dimensions: {
        length: parseFloat(metafields.length_cm || 0),
        width: parseFloat(metafields.width_cm || 0),
        height: parseFloat(metafields.height_cm || 0),
      },
      weight: parseFloat(metafields.weight_grams || 0) / 1000,
      category: metafields.category?.toLowerCase() || "ambient",
    });
  }

  console.log("✅ Cart Items Finalized:", cartItems);

  // Step 1: Volume calculation
  const volumeByCategory = calculateVolume(cartItems);
  console.log("📐 Volume by Category:", volumeByCategory);

  // Mock container data (replace with DB or admin config later)
  const availableContainers = [
    {
      id: "box_small",
      name: "Small Box",
      volume: 0.03,
      weight: 0.5,
      cost_excl_vat: 3.5,
      cost_incl_vat: 4.3,
    },
    {
      id: "box_medium",
      name: "Medium Box",
      volume: 0.06,
      weight: 0.8,
      cost_excl_vat: 5.5,
      cost_incl_vat: 6.7,
    },
    {
      id: "box_large",
      name: "Large Box",
      volume: 0.09,
      weight: 1.2,
      cost_excl_vat: 7.0,
      cost_incl_vat: 8.5,
    },
  ];

  // Step 2: Select containers
  const containerPlan = selectContainers(volumeByCategory, availableContainers);
  console.log("📦 Container Plan:", containerPlan);

  // Step 3: Dry ice
  const transitDays = 2; // future: make dynamic from courier config
  const dryIcePlan = computeDryIce(containerPlan, transitDays);
  console.log("❄️ Dry Ice Plan:", dryIcePlan);

  // Step 4–6: Final shipping cost
  const shippingRate = finalizeRate({
    cartItems,
    containerPlan,
    dryIcePlan,
    transitDays,
    courier: "GLS",
  });

  console.log("💰 Final Rate Breakdown:", shippingRate);

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
