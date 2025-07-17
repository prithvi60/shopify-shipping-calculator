// app/routes/api.rates.js
import { json } from '@remix-run/node';
import { apiVersion } from '../shopify.server.js';
import prisma          from '../db.server.js';
import { getCourierModule } from '../shipping/couriers/index.js';

function formatVariantGID(variantId) {
  return `gid://shopify/ProductVariant/${variantId}`;
}

export const action = async ({ request }) => {
  // 1️⃣ Parse incoming payload & shop header
  const payload = await request.json();
  const shop    = request.headers.get('X-Shopify-Shop-Domain');
  if (!shop) return new Response('Missing shop header', { status: 400 });

  // 🚩 extract destination postal code
  const postalCode = payload.rate?.destination?.postal_code;
  console.log('Shipping to postal code:', postalCode);

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

  // 3️⃣ Build our `cartItems` enriched with product metafields + sku + postalCode
  const items     = payload.rate?.items || [];
  const cartItems = [];

  for (const item of items) {
    // A) fetch the parent product ID *and* SKU
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
                sku
                product { id }
              }
            }`,
          variables: { id: variantGID }
        })
      }
    );
    const lookupJson   = await lookupRes.json();
    const variantNode  = lookupJson.data?.productVariant;
    const productGID   = variantNode?.product?.id;
    const sku          = variantNode?.sku;
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
                metafields(first: 10, namespace: "custom") {
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
      sku,                                 // ← SKU now available
      quantity:   item.quantity,
      dimensions: {
        volume: parseFloat(mf.volume || '0'),
        depth:  parseFloat(mf.depth  || '0'),
        width:  parseFloat(mf.width  || '0'),
        height: parseFloat(mf.height || '0')
      },
      weight:     parseFloat(item.grams || '0') / 1000,
      category:   mf.category?.toLowerCase() || 'ambient',
      postalCode                           // ← postal code on every item
    });
  }

  console.log('Cart items:', cartItems);

  // 4️⃣ Loop through every courier, quote them, and concatenate
  const allRates = [];
  for (const courierName of ['FedEx' /*,'TNT', 'BRT','GLS',…*/]) {
    const { loadFedexConfigAndRates, calculateFedex } = await getCourierModule(courierName);

    // load config & brackets
    const { config, brackets,zones  } = await loadFedexConfigAndRates(prisma);

    // run that courier’s pricing
    const quote = await calculateFedex({
      cartItems,
      config,
      brackets,
      zones,
      transitDays: config.transitDays
    });

    // format for Shopify
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

  console.log('allRates', allRates);
  return json({ rates: allRates });
};
