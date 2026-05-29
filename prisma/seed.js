/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt           = require('bcrypt');
const { Resend }       = require('resend');
const crypto           = require('crypto');
const path             = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────

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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function generateTempPassword(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  return Array.from(crypto.randomBytes(length))
    .map(b => chars[b % chars.length])
    .join('');
}

async function sendCredentials(email, password) {
  const { error } = await resend.emails.send({
    from:    process.env.RESEND_FROM_EMAIL,
    to:      email,
    subject: 'Notaria Sistema — Credenciales Super Admin',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:8px">
        <h2 style="color:#1a202c;margin-bottom:8px">Bienvenido a Notaria Sistema</h2>
        <p style="color:#4a5568">Se ha creado tu cuenta como <strong>Super Admin</strong>.</p>
        <div style="background:#f7fafc;border-radius:6px;padding:16px;margin:24px 0">
          <p style="margin:0 0 4px;color:#718096;font-size:12px">CORREO</p>
          <p style="margin:0 0 16px;font-weight:600;color:#2d3748">${email}</p>
          <p style="margin:0 0 4px;color:#718096;font-size:12px">CONTRASEÑA TEMPORAL</p>
          <p style="margin:0;font-weight:700;font-size:20px;letter-spacing:2px;color:#2d3748;font-family:monospace">${password}</p>
        </div>
        <p style="color:#e53e3e;font-size:13px">⚠️ Cambia esta contraseña inmediatamente después de tu primer inicio de sesión.</p>
      </div>
    `,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

// ─── SEED ─────────────────────────────────────────────────────────────────────

async function main() {
  const email = process.argv[2];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('');
    console.error('  ❌  Uso: node prisma/seed.js <email-super-admin>');
    console.error('  Ej: node prisma/seed.js admin@notaria.com');
    console.error('');
    process.exit(1);
  }

  console.log('');
  console.log('🌱  Notaria Sistema — Database Seed');
  console.log('────────────────────────────────────');
  console.log('');

  const tempPassword = generateTempPassword();

  console.log('  → Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where:  { name: perm.name },
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
      where:  { name: roleDef.name },
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
        where:  { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log('  → Creating super admin user...');
  const hashedPassword = await bcrypt.hash(tempPassword, 12);
  const superAdmin = await prisma.user.upsert({
    where:  { email },
    update: { password: hashedPassword },
    create: {
      email,
      password:  hashedPassword,
      firstName: 'Super',
      lastName:  'Admin',
      isActive:  true,
    },
  });

  await prisma.userRole.upsert({
    where:  { userId_roleId: { userId: superAdmin.id, roleId: roles['SUPER_ADMIN'].id } },
    update: {},
    create: { userId: superAdmin.id, roleId: roles['SUPER_ADMIN'].id },
  });

  console.log('  → Seeding settings...');
  for (const setting of INITIAL_SETTINGS) {
    await prisma.setting.upsert({
      where:  { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('  → Sending credentials via Resend...');
  await sendCredentials(email, tempPassword);

  console.log('');
  console.log('✅  Seed completado.');
  console.log('');
  console.log(`  📧  Super Admin: ${email}`);
  console.log(`  🔑  Contraseña:  ${tempPassword}`);
  console.log(`  ✉️   Correo enviado a ${email}`);
  console.log('  ⚠️   Cambia la contraseña en el primer inicio de sesión.');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
