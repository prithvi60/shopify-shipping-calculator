// app/routes/api.test-rates.js - Test endpoint for multiple shipping rates
import { json } from '@remix-run/node';
import { calculateFedexRate } from './api.fedex.js';
import prisma from '../db.server';

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const weight = parseFloat(url.searchParams.get('weight') || '0.5');
    const country = url.searchParams.get('country') || 'US';
    const service = url.searchParams.get('service') || null;

    // Get FedEx configuration
    const courier = await prisma.courier.findUnique({
      where: { name: 'FEDEX' }
    });

    if (!courier?.config) {
      return json({ error: 'FedEx configuration not found' }, { status: 404 });
    }

    // Test the calculation
    const quotes = calculateFedexRate(courier.config, weight, country, service);

    return json({
      test: {
        weight,
        country,
        service,
        quotes
      },
      config: {
        services: courier.config.services?.length || 0,
        zoneSets: Object.keys(courier.config.zoneSets || {}).length
      }
    });
  } catch (error) {
    console.error('Test rates error:', error);
    return json({ error: error.message }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const payload = await request.json();
    const cartItems = payload.cartItems || [];
    
    if (cartItems.length === 0) {
      return json({ error: 'No cart items provided' }, { status: 400 });
    }

    // Generate test rates based on provided cart items
    const testRates = generateTestRates(cartItems);
    
    return json({
      message: "Custom test rates generated",
      totalRates: testRates.length,
      rates: testRates
    });
  } catch (error) {
    return json({ error: 'Failed to generate test rates', details: error.message }, { status: 500 });
  }
};

// Generate comprehensive test rates for testing
function generateTestRates(cartItems) {
  const totalWeight = cartItems.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
  const basePrice = Math.max(15, totalWeight * 8);
  
  return [
    // TNT Test Services
    {
      service_name: "TNT Standard (Test)",
      service_code: "TNT_STANDARD",
      total_price: Math.round(basePrice * 100),
      currency: "EUR",
      description: "TNT Standard delivery - 3-5 business days"
    },
    {
      service_name: "TNT Express (Test)",
      service_code: "TNT_EXPRESS",
      total_price: Math.round((basePrice + 6.50) * 100),
      currency: "EUR",
      description: "TNT Express delivery - 1-2 business days"
    },
    {
      service_name: "TNT Economy (Test)",
      service_code: "TNT_ECONOMY",
      total_price: Math.round(Math.max(5, basePrice - 2.50) * 100),
      currency: "EUR",
      description: "TNT Economy delivery - 5-7 business days"
    },
    {
      service_name: "TNT Before 9:00 (Test)",
      service_code: "TNT_BEFORE_9",
      total_price: Math.round((basePrice + 12.00) * 100),
      currency: "EUR",
      description: "TNT Before 9:00 AM delivery - Next business day"
    },
    
    // FedEx Test Services
    {
      service_name: "FedEx Standard (Test)",
      service_code: "FEDEX_STANDARD",
      total_price: Math.round(basePrice * 1.1 * 100),
      currency: "EUR",
      description: "FedEx Standard delivery - 2-3 business days"
    },
    {
      service_name: "FedEx Before 10:00 (Test)",
      service_code: "FEDEX_BEFORE_10",
      total_price: Math.round((basePrice * 1.1 + 8.50) * 100),
      currency: "EUR",
      description: "FedEx Before 10:00 AM delivery - Next business day"
    },
    {
      service_name: "FedEx Before 12:00 (Test)",
      service_code: "FEDEX_BEFORE_12",
      total_price: Math.round((basePrice * 1.1 + 5.00) * 100),
      currency: "EUR",
      description: "FedEx Before 12:00 PM delivery - Next business day"
    },
    {
      service_name: "FedEx Economy (Test)",
      service_code: "FEDEX_ECONOMY",
      total_price: Math.round(Math.max(8, basePrice * 1.1 - 3.00) * 100),
      currency: "EUR",
      description: "FedEx Economy delivery - 4-6 business days"
    },

    // Generic Test Services
    {
      service_name: "Economy Express (Test)",
      service_code: "TEST_ECONOMY",
      total_price: Math.round(basePrice * 0.8 * 100),
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
      total_price: Math.round(basePrice * 1.5 * 100),
      currency: "EUR",
      description: "Test priority service - 1-2 business days"
    },
    {
      service_name: "Overnight Express (Test)",
      service_code: "TEST_OVERNIGHT",
      total_price: Math.round(basePrice * 2.2 * 100),
      currency: "EUR",
      description: "Test overnight service - Next business day"
    },
    {
      service_name: "Weekend Delivery (Test)",
      service_code: "TEST_WEEKEND",
      total_price: Math.round(basePrice * 1.8 * 100),
      currency: "EUR",
      description: "Test weekend delivery - Saturday delivery available"
    }
  ];
} 