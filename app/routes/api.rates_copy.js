// app/routes/api.rates.js

import { json } from "@remix-run/node";
import { apiVersion } from "../shopify.server.js";
import prisma from "../db.server.js";
import { calculateVolume } from "../shipping/calculateVolume.js";
import { selectContainers } from "../shipping/selectContainers.js";
import { computeDryIce } from "../shipping/computeDryIce.js";
import { finalizeRate } from "../shipping/finalizeRate.js";

function formatVariantGID(variantId) {
  return `gid://shopify/ProductVariant/${variantId}`;
}

export const action = async ({ request }) => {
  // 1️⃣ Parse payload & shop
  const payload = await request.json();
  const shop    = request.headers.get("X-Shopify-Shop-Domain");
  if (!shop) return new Response("Missing shop header", { status: 400 });

  // 2️⃣ Get accessToken
  const record = await prisma.session.findFirst({
    where:  { shop },
    select: { accessToken: true },
  });
  if (!record?.accessToken) {
    console.error(`No token for ${shop}`);
    return new Response("Session missing", { status: 500 });
  }
  const token = record.accessToken;

  // 3️⃣ Build cartItems with product‑level metafields
  const items     = payload.rate?.items || [];
  const cartItems = [];

  for (const item of items) {
    // A) fetch product ID
    const variantGID = formatVariantGID(item.variant_id);
    const lookup = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method:  "POST",
        headers: {
          "Content-Type":          "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: `
            query($id: ID!) {
              productVariant(id: $id) {
                product { id }
              }
            }`,
          variables: { id: variantGID },
        }),
      }
    );
    const { data: lookupData } = await lookup.json();
    const productGID = lookupData.productVariant?.product?.id;
    if (!productGID) continue;

    // B) fetch shipping metafields on product
    const mfResp = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method:  "POST",
        headers: {
          "Content-Type":          "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: `
            query($id: ID!) {
              product(id: $id) {
                metafields(first: 10, namespace: "shipping") {
                  edges { node { key value } }
                }
              }
            }`,
          variables: { id: productGID },
        }),
      }
    );
    const { data: mfData } = await mfResp.json();
    const mf = (mfData.product?.metafields?.edges || []).reduce(
      (acc, { node }) => ((acc[node.key] = node.value), acc),
      {}
    );

    cartItems.push({
      name: item.name,
      quantity: item.quantity,
      dimensions: {
        length: parseFloat(mf.length_cm || "0"),
        width:  parseFloat(mf.width_cm  || "0"),
        height: parseFloat(mf.height_cm || "0"),
      },
      weight:   parseFloat(item.grams || "0") / 1000,
      category: mf.category?.toLowerCase() || "ambient",
    });
  }

  console.log("Cart items:", cartItems);
// CUSTOM SHIPPING FEE CALCULATION
  // 4️⃣ Calculate volume per category
  const volumeByCategory = calculateVolume(cartItems);

  // 5️⃣ Select optimal containers
  const availableContainers = [
    // replace with your real container data
    { id: "box_small",  name: "Small Box",  volume: 0.03, weight: 0.5, cost_excl_vat: 3.5, cost_incl_vat: 4.3 },
    { id: "box_medium", name: "Medium Box", volume: 0.06, weight: 0.8, cost_excl_vat: 5.5, cost_incl_vat: 6.7 },
    { id: "box_large",  name: "Large Box",  volume: 0.09, weight: 1.2, cost_excl_vat: 7.0, cost_incl_vat: 8.5 },
  ];
  const containerPlan = selectContainers(volumeByCategory, availableContainers);

  // 6️⃣ Compute dry‑ice needs (e.g. 2 days transit)
  const transitDays = 2;
  const dryIcePlan  = computeDryIce(containerPlan, transitDays);

  // 7️⃣ Finalize rate breakdown
  const shippingRateCalc = finalizeRate({
    cartItems,
    containerPlan,
    dryIcePlan,
    transitDays,
    courier: "Fedex",
  });
console.log("shippingRateCalc:", shippingRateCalc);

  // 8️⃣ Build Shopify rate response
  let rates;
  if (Array.isArray(shippingRateCalc)) {
    // multiple service options
    rates = shippingRateCalc.map(r => ({
      service_name: r.name,
      service_code: r.code,
      total_price:  Math.round(r.total * 100),
      currency:     r.currency,
      description:  r.description,
    }));
  } else {
    // single-rate object
    rates = [{
      service_name: "Fedex",
      service_code: "FEDEX_STANDARD",
      total_price:  Math.round(shippingRateCalc.total * 100),
      currency:     shippingRateCalc.currency || "EUR",
      description:  shippingRateCalc.description,
    }];
  }
  return json({ rates });
};
