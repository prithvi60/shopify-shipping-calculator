// app/shipping/couriers/json-based.js - JSON-based courier calculations (TNT, BRT, etc.)
import prisma from '../../db.server.js';

// Load courier configuration from JSON
export async function loadConfigAndRates(courierName) {
  try {
    const courier = await prisma.courier.findUnique({
      where: { name: courierName.toUpperCase() }
    });

    if (!courier) {
      throw new Error(`Courier ${courierName} not found`);
    }

    const config = courier.config;
    
    return {
      config: {
        courierType: config.courierType,
        name: config.basicInfo?.name || courierName,
        description: config.basicInfo?.description || '',
        ...config.shippingConfig?.calculations,
        ...config.shippingConfig?.surcharges,
        dryIce: config.shippingConfig?.dryIce,
        ice: config.shippingConfig?.ice,
        zones: config.zones || [],
        pricingBrackets: config.pricingBrackets || [],
        transitDays: config.transitDays || [],
        services: config.services || []
      },
      brackets: config.pricingBrackets || [],
      zones: config.zones || [],
      containers: [], // Not used in JSON system
      timeSlotFees: config.services || []
    };
  } catch (error) {
    console.error(`Error loading config for ${courierName}:`, error);
    throw error;
  }
}

// Calculate shipping rates from JSON configuration
export function calculate({ cartItems, config }) {
  const courierType = config.courierType;
  
  // Check if courier can serve the destination
  const canServeDestination = checkDestinationSupport(cartItems, config);
  if (!canServeDestination) {
    console.log(`❌ ${courierType}: Cannot serve this destination`);
    return []; // Return empty array if cannot serve destination
  }
  
  if (courierType === 'TNT') {
    return calculateTNTFromJSON({ cartItems, config });
  } else if (courierType === 'BRT') {
    return calculateBRTFromJSON({ cartItems, config });
  } else {
    throw new Error(`Unknown courier type: ${courierType}`);
  }
}

// Check if courier can serve the destination based on configuration
function checkDestinationSupport(cartItems, config) {
  if (!cartItems || cartItems.length === 0) {
    return false;
  }

  const destination = cartItems[0];
  const countryCode = destination.countryCode;
  const province = destination.province;

  // For TNT, check if destination is supported by transit days configuration
  if (config.courierType === 'TNT') {
    // TNT serves Italy - check if we have transit day info for this destination
    if (countryCode !== 'IT') {
      console.log(`❌ TNT: Does not serve ${countryCode} (Italy only)`);
      return false;
    }
    
    // Check if we have transit days for this province/city
    const transitDays = config.transitDays || [];
    const hasTransitInfo = transitDays.some(transit => 
      transit.name === province || 
      transit.name === destination.city ||
      transit.name === destination.postalCode
    );
    
    if (!hasTransitInfo) {
      console.log(`⚠️ TNT: No transit info for ${province}/${destination.city}, allowing anyway`);
    }
    
    return true; // TNT serves all of Italy
  }
  
  // For BRT, similar logic
  if (config.courierType === 'BRT') {
    return countryCode === 'IT'; // BRT also serves Italy only
  }

  return true; // Default to true for unknown courier types
}

// TNT calculation from JSON config
function calculateTNTFromJSON({ cartItems, config }) {
  try {
    // Get destination info from first cart item
    const firstItem = cartItems[0];
    if (!firstItem) {
      throw new Error('No cart items provided');
    }

    const { countryCode, city, province, postalCode } = firstItem;
    
    // Create destination zone object
    const destinationZone = {
      countryCode,
      city,
      province,
      postalCode
    };

    // Find best transit match
    const transitEntry = findBestTransitMatch(destinationZone, config.transitDays || []);
    // Convert hours to days for API response
    const transitDays = Math.round((transitEntry?.days || 72) / 24); // Default 3 days if no match

    // Calculate total weight
    const totalWeight = cartItems.reduce((sum, item) => sum + item.weight, 0);
    console.log(`💰 TNT Price Calculation for ${totalWeight}kg:`);

    // Find pricing bracket
    let bracket = config.pricingBrackets?.find(b =>
      totalWeight >= b.minWeightKg && totalWeight <= b.maxWeightKg
    );

    // If no exact bracket found, try to find the closest bracket for small weights
    if (!bracket && config.pricingBrackets?.length > 0) {
      // For weights smaller than the minimum bracket, use the first bracket
      const sortedBrackets = config.pricingBrackets.sort((a, b) => a.minWeightKg - b.minWeightKg);
      if (totalWeight < sortedBrackets[0].minWeightKg) {
        bracket = sortedBrackets[0];
        console.log(`⚠️  TNT: Weight ${totalWeight}kg below minimum bracket, using ${sortedBrackets[0].minWeightKg}kg bracket`);
      } else {
        // For weights larger than the maximum bracket, use the last bracket  
        const maxBracket = sortedBrackets[sortedBrackets.length - 1];
        if (totalWeight > maxBracket.maxWeightKg) {
          bracket = maxBracket;
          console.log(`⚠️  TNT: Weight ${totalWeight}kg above maximum bracket, using ${maxBracket.maxWeightKg}kg bracket`);
        }
      }
    }

    if (!bracket) {
      throw new Error(`No pricing bracket found for weight ${totalWeight}kg`);
    }

    console.log(`📦 Base pricing bracket: ${bracket.minWeightKg}-${bracket.maxWeightKg}kg = €${bracket.price}`);
    let subtotal = bracket.price || 0;

    // Apply fuel surcharge
    if (config.fuel?.percentage > 0) {
      const fuelSurcharge = subtotal * (config.fuel.percentage / 100);
      console.log(`⛽ Fuel surcharge: ${config.fuel.percentage}% of €${subtotal} = €${fuelSurcharge.toFixed(2)}`);
      subtotal += fuelSurcharge;
    }

    console.log(`📊 Subtotal after fuel: €${subtotal.toFixed(2)}`);

    // Apply VAT
    const vatRate = config.vatPercentage || 21;
    const vatMultiplier = 1 + (vatRate / 100);
    const total = subtotal * vatMultiplier;
    const vatAmount = total - subtotal;
    
    console.log(`🏛️  VAT calculation: €${subtotal.toFixed(2)} × ${vatMultiplier} = €${total.toFixed(2)}`);
    console.log(`🏛️  VAT amount: €${vatAmount.toFixed(2)} (${vatRate}%)`);
    console.log(`💯 Base total with VAT: €${total.toFixed(2)}`);

    // Return multiple TNT service options for testing
    const tntServices = [
      {
        code: 'TNT_STANDARD',
        name: 'TNT Standard',
        description: 'Standard delivery service',
        additionalCost: 0
      },
      {
        code: 'TNT_EXPRESS',
        name: 'TNT Express',
        description: 'Express delivery service',
        additionalCost: 6.50
      },
      {
        code: 'TNT_ECONOMY',
        name: 'TNT Economy',
        description: 'Economy delivery service',
        additionalCost: -2.50
      },
      {
        code: 'TNT_BEFORE_9',
        name: 'TNT Before 9:00',
        description: 'Delivery before 9:00 AM',
        additionalCost: 12.00
      }
    ];

    console.log(`\n🚚 FINAL SERVICE CALCULATIONS:`);
    console.log(`📐 Formula: (Base Price + Fuel Surcharge) × (1 + VAT%) + Service Additional Cost`);
    
    return tntServices.map(service => {
      const finalTotal = Math.max(0, total + service.additionalCost);
      const sign = service.additionalCost >= 0 ? '+' : '';
      console.log(`🚚 ${service.name}: €${total.toFixed(2)} ${sign} €${service.additionalCost} = €${finalTotal.toFixed(2)}`);
      
      return {
        name: `${service.name}`,
        code: service.code,
        total: finalTotal,
        currency: 'EUR',
        description: `${service.description} - Delivery in ${transitDays} business days`,
        transitDays
      };
    });

  } catch (error) {
    console.error('TNT calculation error:', error);
    throw error;
  }
}

// BRT calculation from JSON config (similar to TNT but with different services)
function calculateBRTFromJSON({ cartItems, config }) {
  try {
    // Get destination info from first cart item
    const firstItem = cartItems[0];
    if (!firstItem) {
      throw new Error('No cart items provided');
    }

    const { countryCode, city, province, postalCode } = firstItem;
    
    // Create destination zone object
    const destinationZone = {
      countryCode,
      city,
      province,
      postalCode
    };

    // Find best transit match
    const transitEntry = findBestTransitMatch(destinationZone, config.transitDays || []);
    // Convert hours to days for API response
    const transitDays = Math.round((transitEntry?.days || 48) / 24); // Default 2 days if no match

    // Calculate total weight
    const totalWeight = cartItems.reduce((sum, item) => sum + item.weight, 0);

    // Find pricing bracket
    let bracket = config.pricingBrackets?.find(b =>
      totalWeight >= b.minWeightKg && totalWeight <= b.maxWeightKg
    );

    // If no exact bracket found, try to find the closest bracket
    if (!bracket && config.pricingBrackets?.length > 0) {
      const sortedBrackets = config.pricingBrackets.sort((a, b) => a.minWeightKg - b.minWeightKg);
      if (totalWeight < sortedBrackets[0].minWeightKg) {
        bracket = sortedBrackets[0];
        console.log(`⚠️  BRT: Weight ${totalWeight}kg below minimum bracket, using ${sortedBrackets[0].minWeightKg}kg bracket`);
      } else {
        const maxBracket = sortedBrackets[sortedBrackets.length - 1];
        if (totalWeight > maxBracket.maxWeightKg) {
          bracket = maxBracket;
          console.log(`⚠️  BRT: Weight ${totalWeight}kg above maximum bracket, using ${maxBracket.maxWeightKg}kg bracket`);
        }
      }
    }

    if (!bracket) {
      throw new Error(`No pricing bracket found for weight ${totalWeight}kg`);
    }

    let subtotal = bracket.price || 0;

    // Apply fuel surcharge
    if (config.fuel?.percentage > 0) {
      subtotal += subtotal * (config.fuel.percentage / 100);
    }

    // Apply VAT
    const vatRate = config.vatPercentage || 22; // BRT uses higher VAT
    const total = subtotal * (1 + vatRate / 100);

    // Return multiple BRT service options
    const brtServices = [
      {
        code: 'BRT_STANDARD',
        name: 'BRT Standard',
        description: 'Standard delivery service',
        additionalCost: 0
      },
      {
        code: 'BRT_EXPRESS',
        name: 'BRT Express',
        description: 'Express delivery service',
        additionalCost: 5.00
      },
      {
        code: 'BRT_NEXT_DAY',
        name: 'BRT Next Day',
        description: 'Next day delivery service',
        additionalCost: 15.00
      }
    ];

    return brtServices.map(service => ({
      name: `${config.name} ${service.name} (${transitDays} days)`,
      code: service.code,
      total: Math.max(0, total + service.additionalCost),
      currency: 'EUR',
      description: `${service.description} - Delivery in ${transitDays} business days`,
      transitDays
    }));

  } catch (error) {
    console.error('BRT calculation error:', error);
    throw error;
  }
}

// Helper function to find best transit match
function findBestTransitMatch(destinationZone, transitDays) {
  if (!transitDays || transitDays.length === 0) {
    return { days: 3 }; // Default
  }

  // Try to match in order of specificity: ZIP > CITY > PROVINCE > REGION > COUNTRY
  const priorities = ['ZIP', 'CITY', 'PROVINCE', 'REGION', 'COUNTRY'];
  
  for (const priority of priorities) {
    const match = transitDays.find(td => {
      if (td.zoneType !== priority) return false;
      
      switch (priority) {
        case 'ZIP':
          return td.name === destinationZone.postalCode;
        case 'CITY':
          return td.name.toLowerCase() === destinationZone.city?.toLowerCase();
        case 'PROVINCE':
          return td.name.toLowerCase() === destinationZone.province?.toLowerCase();
        case 'COUNTRY':
          return td.name.toLowerCase() === destinationZone.countryCode?.toLowerCase();
        default:
          return false;
      }
    });
    
    if (match) return match;
  }
  
  // Return first available or default
  return transitDays[0] || { days: 3 };
}

export default {
  loadConfigAndRates,
  calculate
}; 