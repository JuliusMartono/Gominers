// ============================================================
// GOMINERS PLAN_MAP UPDATE — CekGejala.id
// Paste ini ke: C:/google drive/automation/gominers/api/payment-webhook.js
// Ganti PLAN_MAP yang lama dengan ini
// PT Global Operasi Miners — Juni 2026
// ============================================================

const PLAN_MAP = {
  'starter_monthly':      { tier: 'starter',              limit: 10,    devices: 1,   days: 30,  family: false, mitra: false },
  'pro_individu_monthly': { tier: 'pro_individu',          limit: 30,    devices: 1,   days: 30,  family: false, mitra: false },
  'pro_individu_yearly':  { tier: 'pro_individu_yearly',   limit: 400,   devices: 1,   days: 365, family: false, mitra: false },
  'pro_keluarga_monthly': { tier: 'pro_keluarga',          limit: 100,   devices: 5,   days: 30,  family: true,  mitra: false },
  'pro_keluarga_yearly':  { tier: 'pro_keluarga_yearly',   limit: 1500,  devices: 5,   days: 365, family: true,  mitra: false },
  'pro_bisnis_monthly':   { tier: 'pro_bisnis',            limit: 300,   devices: 5,   days: 30,  family: false, mitra: false },
  'pro_bisnis_yearly':    { tier: 'pro_bisnis_yearly',     limit: 4000,  devices: 5,   days: 365, family: false, mitra: false },
  'komunitas_monthly':    { tier: 'komunitas',             limit: 99999, devices: 10,  days: 30,  family: false, mitra: true  },
  'komunitas_yearly':     { tier: 'komunitas_yearly',      limit: 99999, devices: 10,  days: 365, family: false, mitra: true  },
  'enterprise_starter':   { tier: 'enterprise',            limit: 99999, devices: 50,  days: 30,  family: false, mitra: true  },
  'enterprise_growth':    { tier: 'enterprise_growth',     limit: 99999, devices: 200, days: 30,  family: false, mitra: true  },
  // Legacy aliases
  'pro_monthly':          { tier: 'pro_individu',          limit: 30,    devices: 1,   days: 30,  family: false, mitra: false },
  'pro_yearly':           { tier: 'pro_individu_yearly',   limit: 400,   devices: 1,   days: 365, family: false, mitra: false },
  // Old enterprise aliases
  'enterprise_dp':             { tier: 'enterprise',        limit: 99999, devices: 999, days: 30,  family: false, mitra: true },
  'enterprise_monthly':        { tier: 'enterprise',        limit: 99999, devices: 50,  days: 30,  family: false, mitra: true },
  'enterprise_yearly':         { tier: 'enterprise',        limit: 99999, devices: 50,  days: 365, family: false, mitra: true },
  'enterprise_growth_monthly': { tier: 'enterprise_growth', limit: 99999, devices: 200, days: 30,  family: false, mitra: true },
  'enterprise_growth_yearly':  { tier: 'enterprise_growth', limit: 99999, devices: 200, days: 365, family: false, mitra: true },
};

// PLAN_MAP END — do not modify above without updating lib/plans.ts in cekgejala repo
