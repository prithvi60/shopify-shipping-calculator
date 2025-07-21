import { json } from '@remix-run/node';
import { apiVersion } from '../shopify.server.js';
import prisma from '../db.server.js';
import { getCourierModule } from '../shipping/couriers/index.js';

function formatVariantGID(variantId) {
  return `gid://shopify/ProductVariant/${variantId}`;
}

export const action = async ({ request }) => {
  // 1️⃣ Parse incoming payload & shop header
  const payload = await request.json();
  const shop = request.headers.get('X-Shopify-Shop-Domain');
  if (!shop) return new Response('Missing shop header', { status: 400 });

  // 🚩 Extract destination details
  const destination = payload.rate?.destination || {};
  const postalCode  = destination.postal_code;
  const countryCode = destination.country;
  const province    = destination.province;
  const city        = destination.city;

  // console.log('Shipping to:', {
  //   postalCode,
  //   countryCode,
  //   province,
  //   city
  // });

  // 2️⃣ Load the Shopify access token for this shop
  const session = await prisma.session.findFirst({
    where: { shop },
    select: { accessToken: true }
  });
  if (!session?.accessToken) {
    console.error(`No token for ${shop}`);
    return new Response('Session missing', { status: 500 });
  }
  const token = session.accessToken;

  // 3️⃣ Build enriched `cartItems`
  const items = payload.rate?.items || [];
  const cartItems = [];

  for (const item of items) {
    // A) fetch variant + product
    const variantGID = formatVariantGID(item.variant_id);
    const lookupRes = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    const lookupJson = await lookupRes.json();
    const variantNode = lookupJson.data?.productVariant;
    const productGID = variantNode?.product?.id;
    const sku = variantNode?.sku;
    if (!productGID) continue;

    // B) fetch metafields
    const mfRes = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    const mf = mfData.reduce((acc, { node }) => {
      acc[node.key] = node.value;
      return acc;
    }, {});

    // C) push enriched item
    cartItems.push({
      name: item.name,
      sku,
      quantity: item.quantity,
      dimensions: {
        volume: parseFloat(mf.volume || '0'),
        depth:  parseFloat(mf.depth  || '0'),
        width:  parseFloat(mf.width  || '0'),
        height: parseFloat(mf.height || '0')
      },
      weight: parseFloat(item.grams || '0') / 1000,
      category: mf.category?.toLowerCase() || 'ambient',
      postalCode,
      countryCode,
      city,
      province
    });
  }

  // console.log('Cart items:', cartItems);

  const allRates = [];
  for (const courierName of ['FedEx' ,'TNT'/*,'BRT',...*/]) {
    // Dynamically get the module and its standardized functions
    const courierMod = getCourierModule(courierName);
    const { loadConfigAndRates, calculate } = courierMod; // Destructure generic names

    // Load config, brackets, and zones using the generic function
    const { config, brackets, zones } = await loadConfigAndRates(prisma); // Pass prisma if needed by the module

    // Calculate quote using the generic function
    const quote = await calculate({
      cartItems,
      config,
      brackets,
      zones, // zones might be null for TNT, handle in calculateTnt
      transitDays: config.transitDays
    });

    // Format the quote into the expected Shopify Carrier Service API response format
    const formatted = Array.isArray(quote)
      ? quote.map(r => ({
          service_name: r.name,
          service_code: r.code,
          total_price: Math.round(r.total * 100), // Prices are usually in cents for Shopify
          currency: r.currency,
          description: r.description,
        }))
      : [{
          service_name: quote.name,
          service_code: quote.code,
          total_price: Math.round(quote.total * 100),
          currency: quote.currency || 'EUR', // Default to EUR if not provided
          description: quote.description,
        }];

    allRates.push(...formatted);
  }

  // console.log('allRates', allRates);

  return json({ rates: allRates });
};
