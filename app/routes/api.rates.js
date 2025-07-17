import { json } from '@remix-run/node';
import { apiVersion } from '../shopify.server.js';
import prisma          from '../db.server.js';
import {  getCourierModule } from '../shipping/couriers/index.js';

function formatVariantGID(variantId) {
  return `gid://shopify/ProductVariant/${variantId}`;
}

export const action = async ({ request }) => {
  // 1️⃣ Parse incoming payload & shop header
  const payload = await request.json();
  const shop    = request.headers.get('X-Shopify-Shop-Domain');
  if (!shop) return new Response('Missing shop header', { status: 400 });

  // 2️⃣ Load the Shopify access token for this shop
  const session = await prisma.session.findFirst({
    where:  { shop },
    select: { accessToken: true }
  });
  if (!session?.accessToken) {
    console.error(`No token for ${shop}`);
    return new Response('Session missing', { status: 500 });
  }
  const token = session.accessToken;

  // 3️⃣ Build our `cartItems` enriched with product metafields
  const items    = payload.rate?.items || [];
  const cartItems = [];

  for (const item of items) {
    // A) fetch the parent product ID
    const variantGID = formatVariantGID(item.variant_id);
    const lookupRes  = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type':          'application/json',
          'X-Shopify-Access-Token': token
        },
        body: JSON.stringify({
          query: `
            query($id: ID!) {
              productVariant(id: $id) {
                product { id }
              }
            }`,
          variables: { id: variantGID }
        })
      }
    );
    const lookupJson   = await lookupRes.json();
    const productGID   = lookupJson.data?.productVariant?.product?.id;
    if (!productGID) continue;

    // B) fetch shipping metafields on that product
    const mfRes = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type':          'application/json',
          'X-Shopify-Access-Token': token
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
          variables: { id: productGID }
        })
      }
    );
    const mfJson = await mfRes.json();
    const mfData = mfJson.data?.product?.metafields?.edges || [];
    const mf     = mfData.reduce((acc, { node }) => {
      acc[node.key] = node.value;
      return acc;
    }, {});

    cartItems.push({
      name:       item.name,
      quantity:   item.quantity,
      dimensions: {
        length: parseFloat(mf.length_cm || '0'),
        width:  parseFloat(mf.width_cm  || '0'),
        height: parseFloat(mf.height_cm || '0')
      },
      weight:   parseFloat(item.grams || '0') / 1000,
      category: mf.category?.toLowerCase() || 'ambient'
    });
  }

  console.log('Cart items:', cartItems);

  // 4️⃣ Loop through every courier, quote them, and concatenate
  const allRates = [];


  for (const courierName of ['FedEx' /*, 'BRT','GLS',…*/]) {
    const { loadFedexConfigAndRates, calculateFedex } = getCourierModule(courierName);

    // 3️⃣ load config & brackets out of your DB
    const { config, brackets } = await loadFedexConfigAndRates(prisma);

    // 4️⃣ run that courier’s pricing routine
    const quote = await calculateFedex({
      cartItems,
      config,
      brackets,
      transitDays: config.transitDays
    });

    // 5️⃣ format it for Shopify
    const formatted = Array.isArray(quote)
      ? quote.map(r => ({
          service_name: r.name,
          service_code: r.code,
          total_price:  Math.round(r.total * 100),
          currency:     r.currency,
          description:  r.description,
        }))
      : [{
          service_name: quote.name,
          service_code: quote.code,
          total_price:  Math.round(quote.total * 100),
          currency:     quote.currency || 'EUR',
          description:  quote.description,
        }];

    allRates.push(...formatted);
  }

  return json({ rates: allRates });
};
