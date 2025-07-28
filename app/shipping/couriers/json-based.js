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
  
  if (courierType === 'TNT') {
    return calculateTNTFromJSON({ cartItems, config });
  } else if (courierType === 'BRT') {
    return calculateBRTFromJSON({ cartItems, config });
  } else {
    throw new Error(`Unknown courier type: ${courierType}`);
  }
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
    const transitDays = transitEntry?.days || 3;

    // Calculate total weight
    const totalWeight = cartItems.reduce((sum, item) => sum + item.weight, 0);

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

    let subtotal = bracket.price || 0;

    // Apply fuel surcharge
    if (config.fuel?.percentage > 0) {
      subtotal += subtotal * (config.fuel.percentage / 100);
    }

    // Apply VAT
    const vatRate = config.vatPercentage || 21;
    const total = subtotal * (1 + vatRate / 100);

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

    return tntServices.map(service => ({
      name: `${config.name} ${service.name} (${transitDays} days)`,
      code: service.code,
      total: Math.max(0, total + service.additionalCost),
      currency: 'EUR',
      description: `${service.description} - Delivery in ${transitDays} business days`,
      transitDays
    }));

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
    const transitDays = transitEntry?.days || 2; // BRT is typically faster

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