/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const PERMISSIONS = [
  { name: 'users:create',         action: 'create',         resource: 'users',       description: 'Crear usuarios' },
  { name: 'users:read',           action: 'read',           resource: 'users',       description: 'Ver usuarios' },
  { name: 'users:update',         action: 'update',         resource: 'users',       description: 'Editar usuarios' },
  { name: 'users:delete',         action: 'delete',         resource: 'users',       description: 'Eliminar usuarios' },
  { name: 'users:reset-password', action: 'reset-password', resource: 'users',       description: 'Resetear contraseña de usuarios' },
  { name: 'roles:create',         action: 'create',         resource: 'roles',       description: 'Crear roles' },
  { name: 'roles:read',           action: 'read',           resource: 'roles',       description: 'Ver roles' },
  { name: 'roles:update',         action: 'update',         resource: 'roles',       description: 'Editar roles' },
  { name: 'roles:delete',         action: 'delete',         resource: 'roles',       description: 'Eliminar roles' },
  { name: 'roles:assign',         action: 'assign',         resource: 'roles',       description: 'Asignar roles a usuarios' },
  { name: 'permissions:create',   action: 'create',         resource: 'permissions', description: 'Crear permisos' },
  { name: 'permissions:read',     action: 'read',           resource: 'permissions', description: 'Ver permisos' },
  { name: 'permissions:update',   action: 'update',         resource: 'permissions', description: 'Editar permisos' },
  { name: 'permissions:delete',   action: 'delete',         resource: 'permissions', description: 'Eliminar permisos' },
  { name: 'permissions:grant',    action: 'grant',          resource: 'permissions', description: 'Otorgar/quitar permisos' },
  { name: 'archives:create',      action: 'create',         resource: 'archives',    description: 'Crear archivos notariales' },
  { name: 'archives:read',        action: 'read',           resource: 'archives',    description: 'Ver archivos notariales' },
  { name: 'archives:update',      action: 'update',         resource: 'archives',    description: 'Editar archivos notariales' },
  { name: 'archives:delete',      action: 'delete',         resource: 'archives',    description: 'Eliminar archivos notariales' },
  { name: 'clients:create',       action: 'create',         resource: 'clients',     description: 'Crear clientes' },
  { name: 'clients:read',         action: 'read',           resource: 'clients',     description: 'Ver clientes' },
  { name: 'logs:read',            action: 'read',           resource: 'logs',        description: 'Ver logs del sistema' },
  { name: 'settings:read',        action: 'read',           resource: 'settings',    description: 'Ver configuraciones del sistema' },
  { name: 'settings:update',      action: 'update',         resource: 'settings',    description: 'Actualizar configuraciones del sistema' },
];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    'users:create', 'users:read', 'users:update', 'users:delete', 'users:reset-password',
    'roles:create', 'roles:read', 'roles:update', 'roles:delete', 'roles:assign',
    'permissions:create', 'permissions:read', 'permissions:update', 'permissions:delete', 'permissions:grant',
    'archives:create', 'archives:read', 'archives:update', 'archives:delete',
    'clients:create', 'clients:read',
    'logs:read',
    'settings:read', 'settings:update',
  ],
  NOTARIO: [
    'users:create', 'users:read', 'users:update', 'users:delete', 'users:reset-password',
    'roles:read', 'roles:assign',
    'permissions:read', 'permissions:grant',
    'archives:create', 'archives:read', 'archives:update',
    'clients:create', 'clients:read',
  ],
  MATRIZADOR: [
    'archives:read',
    'clients:read',
  ],
  ARCHIVADOR: [
    'archives:create', 'archives:read', 'archives:update',
    'clients:create', 'clients:read',
  ],
};

const INITIAL_SETTINGS = [
  { key: 'system_name',    value: 'Notaria Sistema',  label: 'Nombre del sistema' },
  { key: 'system_version', value: '1.0.0',            label: 'Versión del sistema' },
  { key: 'logo_url',       value: '',                 label: 'URL del logo' },
  { key: 'max_file_size',  value: '10485760',         label: 'Tamaño máximo de archivo (bytes)' },
];

async function main() {
  console.log('🌱 Starting database seed...');

  console.log('  → Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm,
    });
  }

  console.log('  → Seeding roles...');
  const roleDefinitions = [
    { name: 'Super Admin', type: 'SUPER_ADMIN', description: 'Acceso total al sistema' },
    { name: 'Notario',     type: 'NOTARIO',     description: 'Notario con gestión de usuarios y archivos' },
    { name: 'Matrizador',  type: 'MATRIZADOR',  description: 'Solo lectura de archivos' },
    { name: 'Archivador',  type: 'ARCHIVADOR',  description: 'Gestión de archivos notariales' },
  ];

  const roles = {};
  for (const roleDef of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {},
      create: roleDef,
    });
    roles[roleDef.type] = role;
  }

  console.log('  → Assigning permissions to roles...');
  for (const [roleType, permNames] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roles[roleType];
    for (const permName of permNames) {
      const permission = await prisma.permission.findUnique({ where: { name: permName } });
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log('  → Creating super admin user...');
  const hashedPassword = await bcrypt.hash('Admin123!', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@notaria.com' },
    update: {},
    create: {
      email:     'admin@notaria.com',
      password:  hashedPassword,
      firstName: 'Super',
      lastName:  'Admin',
      isActive:  true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: roles['SUPER_ADMIN'].id } },
    update: {},
    create: { userId: superAdmin.id, roleId: roles['SUPER_ADMIN'].id },
  });

  console.log('  → Seeding settings...');
  for (const setting of INITIAL_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('✅ Seed completed successfully!');
  console.log('');
  console.log('  📧 Super Admin: admin@notaria.com');
  console.log('  🔑 Password:    Admin123!');
  console.log('  ⚠️  Change the password after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
