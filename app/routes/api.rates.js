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

    // 4️⃣ Get rates from all active couriers using unified system
    const allRates = [];
    const courierNames = ['TNT', 'FEDEX']; // Add more as needed

    for (const courierName of courierNames) {
      try {
        console.log(`🚚 Processing ${courierName}...`);
        
        // Get the unified courier module
        const courierMod = getCourierModule(courierName);
        const { loadConfigAndRates, calculate } = courierMod;

        // Load config and rates using the unified function
        const { config, isActive } = await loadConfigAndRates();

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

        // Format the quote into the expected Shopify Carrier Service API response format
        const formatted = Array.isArray(quote)
          ? quote.map(r => ({
              service_name: r.name || `${courierName} Service`,
              service_code: r.code || `${courierName}_STANDARD`,
              total_price: Math.round((r.total || 0) * 100), // Prices in cents for Shopify
              currency: r.currency || 'EUR',
              description: r.description || `${courierName} shipping service`,
            }))
          : [{
              service_name: quote.name || `${courierName} Service`,
              service_code: quote.code || `${courierName}_STANDARD`,
              total_price: Math.round((quote.total || 0) * 100),
              currency: quote.currency || 'EUR',
              description: quote.description || `${courierName} shipping service`,
            }];

        allRates.push(...formatted);
        console.log(`✅ ${courierName}: ${formatted.length} rates generated`);
        
      } catch (error) {
        console.error(`❌ Error calculating ${courierName} rates:`, error);
        // Continue with other couriers even if one fails
      }
    }

    // 🧪 Add additional test rates for comprehensive testing
    const testRates = generateTestRates(cartItems);
    allRates.push(...testRates);

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

// Generate additional test rates for testing purposes
function generateTestRates(cartItems) {
  const totalWeight = cartItems.reduce((sum, item) => sum + item.weight, 0);
  const basePrice = Math.max(15, totalWeight * 8); // Base calculation
  
  return [
    {
      service_name: "Economy Express (Test)",
      service_code: "TEST_ECONOMY",
      total_price: Math.round(basePrice * 0.8 * 100), // 20% cheaper
      currency: "EUR",
      description: "Test economy service - 5-7 business days"
    },
    {
      service_name: "Standard Express (Test)",
      service_code: "TEST_STANDARD", 
      total_price: Math.round(basePrice * 100),
      currency: "EUR",
      description: "Test standard service - 3-5 business days"
    },
    {
      service_name: "Priority Express (Test)",
      service_code: "TEST_PRIORITY",
      total_price: Math.round(basePrice * 1.5 * 100), // 50% more expensive
      currency: "EUR",
      description: "Test priority service - 1-2 business days"
    },
    {
      service_name: "Overnight Express (Test)",
      service_code: "TEST_OVERNIGHT",
      total_price: Math.round(basePrice * 2.2 * 100), // 120% more expensive
      currency: "EUR",
      description: "Test overnight service - Next business day"
    },
    {
      service_name: "Weekend Delivery (Test)",
      service_code: "TEST_WEEKEND",
      total_price: Math.round(basePrice * 1.8 * 100), // 80% more expensive
      currency: "EUR",
      description: "Test weekend delivery - Saturday delivery available"
    }
  ];
}
