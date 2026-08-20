import { PrismaClient, UserRole, HostType } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Database Seeding for FleetUpdate-Hub...');

  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@fleetupdate.local';
  const isCustomPassword = Boolean(process.env.INITIAL_ADMIN_PASSWORD);
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'SecOps Administrator',
        passwordHash,
        role: UserRole.ADMIN,
        twoFactorEnabled: false
      }
    });

    console.log(`✅ Default Administrator created: ${admin.email}`);
    console.log(`🔑 Initial Password: ${adminPassword}`);
    if (!isCustomPassword) {
      console.log('🔒 (A cryptographically secure random password was generated automatically)');
    }
    console.log('⚠️  Please change this password upon first login and enable 2FA TOTP!');
  } else {
    console.log(`ℹ️ Administrator ${adminEmail} already exists.`);
  }

  // Create audit log for initialization
  await prisma.auditLog.create({
    data: {
      userEmail: adminEmail,
      action: 'SYSTEM_INITIALIZED',
      resourceType: 'SYSTEM',
      details: { message: 'Database initialized with default admin credentials.' },
      ipAddress: '127.0.0.1'
    }
  });

  console.log('🚀 Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
