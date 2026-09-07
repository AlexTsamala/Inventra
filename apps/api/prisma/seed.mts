import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Permissions accrete phase by phase, as the features that need them land.
 * Phase 1 only has identity, so these are the only codes a guard could
 * meaningfully enforce today. Seeding `invoice:issue` now would be a promise
 * the codebase cannot keep.
 */
const PERMISSIONS = [
  { code: 'user:invite', description: 'Invite a user to the tenant' },
  { code: 'user:read', description: 'View users in the tenant' },
  { code: 'tenant:manage', description: 'Change tenant settings' },
] as const;

const ALL_PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

/** The five roles of BR-2. Shared by every tenant; not tenant-owned. */
const ROLES = [
  { code: 'OWNER', name: 'Owner', permissions: ALL_PERMISSION_CODES },
  { code: 'SALES_REP', name: 'Sales rep', permissions: [] },
  { code: 'WAREHOUSE_OPERATOR', name: 'Warehouse operator', permissions: [] },
  { code: 'ACCOUNTANT', name: 'Accountant', permissions: [] },
  // Read-only everywhere, so it gains every read permission as they appear.
  { code: 'AUDITOR', name: 'Auditor', permissions: ['user:read'] },
] as const satisfies readonly {
  code: string;
  name: string;
  permissions: readonly (typeof PERMISSIONS)[number]['code'][];
}[];

async function main(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { description: permission.description },
    });
  }

  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { code: role.code },
      create: { code: role.code, name: role.name },
      update: { name: role.name },
    });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...role.permissions] } },
    });

    // Re-derive the grants from this file rather than merging into whatever is
    // already there, so removing a permission here actually revokes it.
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: saved.id,
        permissionId: { notIn: permissions.map((p) => p.id) },
      },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: saved.id, permissionId: permission.id },
        },
        create: { roleId: saved.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  console.log(
    `Seeded ${PERMISSIONS.length} permissions and ${ROLES.length} roles.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
