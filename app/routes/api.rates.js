// app/routes/api.rates.js - Unified JSON-based courier rates API
import { json } from '@remix-run/node';
import { apiVersion } from '../shopify.server.js';
import prisma from '../db.server.js';
import { getCourierModule } from '../shipping/couriers/index.js';

function formatVariantGID(variantId) {
  return `gid://shopify/ProductVariant/${variantId}`;
}

export const action = async ({ request }) => {
  try {
    // 1️⃣ Parse incoming payload & shop header
    const payload = await request.json();
    const shop = request.headers.get('X-Shopify-Shop-Domain');
    if (!shop) return new Response('Missing shop header', { status: 400 });

    const { rate } = payload;
    if (!rate) {
      return json({ error: 'Missing rate data' }, { status: 400 });
    }

    // 🚩 Extract destination details
    const destination = rate.destination || {};
    const postalCode = destination.postal_code;
    const countryCode = destination.country;
    const province = destination.province;
    const city = destination.city;

    console.log('📦 Processing rate request for:', { shop, countryCode, city });

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

    // 3️⃣ Build enriched `cartItems` by fetching metafields from Shopify
    const items = rate.items || [];
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

      // C) Build enriched cart item
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
        weight: parseFloat(item.grams || '0') / 1000, // Convert grams to kg
        category: mf.category?.toLowerCase() || 'ambient',
        postalCode,
        countryCode,
        city,
        province
      });
    }

    console.log('🛒 Processed cart items:', cartItems.length);

    // 4️⃣ Get rates from all active couriers that can serve this destination
    const allRates = [];
    
    // Get all active couriers from database
    const activeCouriers = await prisma.courier.findMany({
      where: { isActive: true },
      select: { name: true, config: true }
    });

    console.log(`📦 Found ${activeCouriers.length} active couriers for ${countryCode}, ${city}`);

    for (const courierRecord of activeCouriers) {
      const courierName = courierRecord.name;
      try {
        console.log(`🚚 Processing ${courierName}...`);
        
        // Get the unified courier module
        const courierMod = getCourierModule(courierName);
        const { loadConfigAndRates, calculate } = courierMod;

        // Load config and rates using the unified function
        const { config, isActive } = await loadConfigAndRates();

        console.log('🚚 Config:', config);

        // Skip inactive couriers
        if (isActive === false) {
          console.log(`⏭️ ${courierName}: Courier is inactive, skipping`);
          continue;
        }

        // Calculate quote using the unified function
        const quote = await calculate({
          cartItems,
          config
        });

        if (!quote || (Array.isArray(quote) && quote.length === 0)) {
          console.log(`⚠️ ${courierName}: No rates returned`);
          continue;
        }

        // Helper function to calculate arrival date
        const getArrivalDate = (transitDays) => {
          const today = new Date();
          const arrivalDate = new Date(today);
          arrivalDate.setDate(today.getDate() + (transitDays || 3)); // Default 3 days if not specified
          return arrivalDate.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          });
        };

        // Format the quote into the expected Shopify Carrier Service API response format
        const formatted = Array.isArray(quote)
          ? quote.map(r => {
              const transitDays = r.transitDays || config.transitDays || (courierName === 'TNT' ? 2 : 3);
              const arrivalDate = getArrivalDate(transitDays);
              return {
                service_name: r.name || `${courierName} EXPRESS`,
                service_code: r.code || `${courierName}_STANDARD`,
                total_price: Math.round((r.total || 0) * 100), // Prices in cents for Shopify
                currency: r.currency || 'EUR',
                description: `Arrival on ${arrivalDate}`,
              };
            })
          : [{
              service_name: quote.name || `${courierName} EXPRESS`,
              service_code: quote.code || `${courierName}_STANDARD`,
              total_price: Math.round((quote.total || 0) * 100),
              currency: quote.currency || 'EUR',
              description: `Arrival on ${getArrivalDate(quote.transitDays || config.transitDays || (courierName === 'TNT' ? 2 : 3))}`,
            }];

        allRates.push(...formatted);
        console.log(`✅ ${courierName}: ${formatted.length} rates generated`);
        
      } catch (error) {
        console.error(`❌ Error calculating ${courierName} rates:`, error);
        // Continue with other couriers even if one fails
      }
    }

    console.log("allRates (full data):", JSON.stringify(allRates, null, 2));

    console.log(`📊 Total rates generated: ${allRates.length}`);

    // 5️⃣ Return response in Shopify Carrier Service format
    return json({
      rates: allRates
    });

  } catch (error) {
    console.error('❌ Rate calculation error:', error);
    return json({ 
      error: 'Failed to calculate shipping rates',
      details: error.message 
    }, { status: 500 });
  }
};


