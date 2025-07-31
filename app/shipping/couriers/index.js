// app/shipping/couriers/index.js - Unified courier system
import prisma from '../../db.server';
import { calculateFedexRate } from '../../routes/api.fedex.js';

// Import existing courier modules
import { default as jsonBasedModule } from './json-based.js';

/**
 * Get the appropriate courier module for calculations
 */
export function getCourierModule(courierName) {
  switch (courierName.toUpperCase()) {
    case 'FEDEX':
      return {
        loadConfigAndRates: () => loadFedexConfig(),
        calculate: (params) => calculateFedexQuote(params)
      };
    
    case 'TNT':
      return {
        loadConfigAndRates: () => jsonBasedModule.loadConfigAndRates('TNT'),
        calculate: (params) => jsonBasedModule.calculate(params)
      };
    
    case 'BRT':
      return {
        loadConfigAndRates: () => jsonBasedModule.loadConfigAndRates('BRT'),
        calculate: (params) => jsonBasedModule.calculate(params)
      };
    
    default:
      throw new Error(`Unsupported courier: ${courierName}`);
  }
}

/**
 * Load FedEx configuration from database
 */
async function loadFedexConfig() {
  try {
    const courier = await prisma.courier.findUnique({
      where: { name: 'FEDEX' }
    });

    if (!courier?.config) {
      throw new Error('FedEx configuration not found');
    }

    return {
      config: courier.config,
      isActive: courier.isActive
    };
  } catch (error) {
    console.error('Error loading FedEx config:', error);
    throw error;
  }
}

/**
 * Calculate FedEx shipping quote using the new system
 */
async function calculateFedexQuote({ cartItems, config }) {
  try {
    if (!cartItems || cartItems.length === 0) {
      throw new Error('No cart items provided');
    }

    // Calculate total weight and determine destination
    const totalWeight = cartItems.reduce((sum, item) => sum + (item.weight || 0), 0);
    const destination = cartItems[0]; // Use first item for destination info
    
    if (!destination.countryCode) {
      throw new Error('Destination country not specified');
    }

    // Check if FedEx can serve this destination (international only, not Italy)
    if (destination.countryCode === 'IT') {
      console.log('❌ FedEx: Does not serve Italy (international only)');
      return [];
    }

    // Use the new FedEx calculation function
    const quotes = calculateFedexRate(config, totalWeight, destination.countryCode);
    
    if (!quotes || quotes.length === 0) {
      console.warn(`No FedEx rates available for ${destination.countryCode}, weight: ${totalWeight}kg`);
      return [];
    }

    // Apply shipping configuration (surcharges, VAT, etc.)
    return quotes.map(quote => ({
      ...quote,
      total: applyFedexSurcharges(quote.total, cartItems, config),
      courierName: 'FEDEX'
    }));

  } catch (error) {
    console.error('FedEx quote calculation error:', error);
    return [];
  }
}

/**
 * Apply FedEx-specific surcharges and adjustments
 */
function applyFedexSurcharges(baseRate, cartItems, config) {
  let finalRate = baseRate;
  const shippingConfig = config.shippingConfig || {};

  // Apply fuel surcharge
  if (shippingConfig.surcharges?.fuel?.percentage) {
    const fuelSurcharge = finalRate * (shippingConfig.surcharges.fuel.percentage / 100);
    finalRate += fuelSurcharge;
  }

  // Apply wine surcharge (per bottle)
  const wineItems = cartItems.filter(item => 
    item.category && item.category.toLowerCase().includes('wine')
  );
  if (wineItems.length > 0 && shippingConfig.surcharges?.wine) {
    const totalWineBottles = wineItems.reduce((sum, item) => sum + item.quantity, 0);
    finalRate += totalWineBottles * shippingConfig.surcharges.wine;
  }

  // Apply dry ice costs if needed
  const dryIceItems = cartItems.filter(item => 
    item.category && item.category.toLowerCase().includes('frozen')
  );
  if (dryIceItems.length > 0 && shippingConfig.dryIce?.costPerKg) {
    const totalDryIceWeight = dryIceItems.reduce((sum, item) => sum + item.weight, 0);
    const dryIceCost = totalDryIceWeight * shippingConfig.dryIce.costPerKg;
    finalRate += dryIceCost;
  }

  // Apply VAT
  if (shippingConfig.calculations?.vatPercentage) {
    const vatAmount = finalRate * (shippingConfig.calculations.vatPercentage / 100);
    finalRate += vatAmount;
  }

  return Math.round(finalRate * 100) / 100; // Round to 2 decimal places
}

/**
 * Generic courier calculation function for backward compatibility
 */
export async function calculateShippingRates(courierName, cartItems, destination = null) {
  try {
    const courierModule = getCourierModule(courierName);
    const { config } = await courierModule.loadConfigAndRates();
    
    // If destination is provided separately, add it to cart items
    if (destination && cartItems.length > 0) {
      cartItems = cartItems.map(item => ({
        ...item,
        countryCode: destination.countryCode,
        city: destination.city,
        postalCode: destination.postalCode,
        province: destination.province
      }));
    }

    return await courierModule.calculate({ cartItems, config });
  } catch (error) {
    console.error(`Error calculating ${courierName} rates:`, error);
    return [];
  }
}

/**
 * Get all available couriers and their basic info
 */
export async function getAvailableCouriers() {
  try {
    const couriers = await prisma.courier.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        config: true,
        isActive: true,
        updatedAt: true
      }
    });

    return couriers.map(courier => ({
      id: courier.id,
      name: courier.name,
      displayName: courier.config?.basicInfo?.name || courier.name,
      description: courier.config?.basicInfo?.description || '',
      isActive: courier.isActive,
      lastUpdated: courier.updatedAt
    }));
  } catch (error) {
    console.error('Error fetching available couriers:', error);
    return [];
  }
}

/**
 * Validate courier configuration
 */
export function validateCourierConfig(courierName, config) {
  const errors = [];

  if (!config) {
    errors.push('Configuration is required');
    return errors;
  }

  switch (courierName.toUpperCase()) {
    case 'FEDEX':
      // Validate FedEx specific configuration
      if (!config.services || config.services.length === 0) {
        errors.push('At least one service must be configured');
      }
      
      if (!config.zoneSets || Object.keys(config.zoneSets).length === 0) {
        errors.push('Zone sets must be configured');
      }

      // Validate each service has pricing structure
      config.services?.forEach((service, index) => {
        if (!service.pricingStructure?.brackets || service.pricingStructure.brackets.length === 0) {
          errors.push(`Service "${service.name}" must have pricing brackets`);
        }
      });
      break;

    case 'TNT':
    case 'BRT':
      // Validate JSON-based courier configuration
      if (!config.zones || config.zones.length === 0) {
        errors.push('Zones must be configured');
      }
      
      if (!config.pricingBrackets || config.pricingBrackets.length === 0) {
        errors.push('Pricing brackets must be configured');
      }
      break;

    default:
      errors.push(`Unknown courier type: ${courierName}`);
  }

  return errors;
}
