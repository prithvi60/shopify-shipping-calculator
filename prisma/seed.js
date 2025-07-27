import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed process...');
  
  try {
    // Read TNT configuration
    const tntConfigPath = path.join(__dirname, 'courier-configs', 'tnt-config.json');
    const tntConfig = JSON.parse(fs.readFileSync(tntConfigPath, 'utf8'));
    
    // Read FedEx configuration  
    const fedexConfigPath = path.join(__dirname, 'courier-configs', 'fedex-config.json');
    const fedexConfig = JSON.parse(fs.readFileSync(fedexConfigPath, 'utf8'));

    // Seed TNT courier
    console.log('📦 Seeding TNT courier...');
    const tntCourier = await prisma.courier.upsert({
      where: { name: 'TNT' },
      create: {
        name: 'TNT',
        config: tntConfig,
        isActive: true
      },
      update: {
        config: tntConfig,
        isActive: true,
        updatedAt: new Date()
      }
    });
    console.log(`✅ TNT courier created/updated with ID: ${tntCourier.id}`);

    // Seed FedEx courier
    console.log('📦 Seeding FedEx courier...');
    const fedexCourier = await prisma.courier.upsert({
      where: { name: 'FEDEX' },
      create: {
        name: 'FEDEX',
        config: fedexConfig,
        isActive: true
      },
      update: {
        config: fedexConfig,
        isActive: true,
        updatedAt: new Date()
      }
    });
    console.log(`✅ FedEx courier created/updated with ID: ${fedexCourier.id}`);

    // Summary
    console.log('\n🎉 Seed completed successfully!');
    console.log(`📊 Seeded couriers:`);
    console.log(`   - TNT: ${tntCourier.id}`);
    console.log(`   - FedEx: ${fedexCourier.id}`);

    // Verify the data
    const allCouriers = await prisma.courier.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log('\n📋 All couriers in database:');
    allCouriers.forEach(courier => {
      console.log(`   - ${courier.name} (${courier.id}) - Active: ${courier.isActive}`);
    });

  } catch (error) {
    console.error('❌ Error during seed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('💥 Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 