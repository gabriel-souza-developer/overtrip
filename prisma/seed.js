"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    // Create admin user if not exists
    const adminEmail = 'admin@overtrip.com.br';
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
        console.error('❌ ADMIN_PASSWORD environment variable is required');
        console.error('   Set it before running seed: ADMIN_PASSWORD="sua-senha-forte" npx tsx prisma/seed.ts');
        process.exit(1);
    }
    if (adminPassword.length < 8) {
        console.error('❌ ADMIN_PASSWORD must be at least 8 characters');
        process.exit(1);
    }
    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
    });
    if (!existingAdmin) {
        const passwordHash = await bcryptjs_1.default.hash(adminPassword, 12);
        await prisma.user.create({
            data: {
                email: adminEmail,
                name: 'Administrador OVERTRIP',
                passwordHash,
                role: 'admin',
            },
        });
        console.log(`✅ Admin user created:`);
        console.log(`   Email: ${adminEmail}`);
        console.log(`   Password: [definida via ADMIN_PASSWORD]`);
    }
    else {
        console.log('ℹ️  Admin user already exists');
    }
    console.log('✅ Seeding completed');
}
main()
    .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map