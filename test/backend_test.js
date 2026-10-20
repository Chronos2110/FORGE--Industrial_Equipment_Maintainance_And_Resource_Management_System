const app = require('../server');
const { connectDB, closeDB } = require('../src/db');
const { seedData } = require('../src/seed');

let server;
const PORT = 5055;
const BASE_URL = `http://localhost:${PORT}`;

async function request(method, path, body = null, token = null) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('\n--- STARTING FORGE NATIVE MONGODB BACKEND INTEGRATION TESTS ---\n');

  // Connect to MongoDB and seed fresh test dataset
  await connectDB();
  await seedData();

  // Start temporary test server
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Health check
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.data.status === 'ONLINE' && health.data.database === 'MongoDB', 'API Health Check returns ONLINE with Node.js + Express.js + MongoDB');

    // 2. Authentication: Admin Login
    const adminLogin = await request('POST', '/api/auth/login', {
      username: 'admin',
      password: 'admin123',
      role: 'Administrator'
    });
    assert(adminLogin.status === 200 && adminLogin.data.token, 'Admin login returns valid JWT token');
    const adminToken = adminLogin.data.token;

    // 3. Authentication: Technician Login
    const techLogin = await request('POST', '/api/auth/login', {
      username: 'tech_rajesh',
      password: 'tech123',
      role: 'Technician'
    });
    assert(techLogin.status === 200 && techLogin.data.user.role === 'TECHNICIAN', 'Technician login returns technician role');
    const techToken = techLogin.data.token;

    // 4. Authentication: Operator Login
    const opLogin = await request('POST', '/api/auth/login', {
      username: 'op_floor',
      password: 'oper123',
      role: 'Operator'
    });
    assert(opLogin.status === 200 && opLogin.data.user.role === 'OPERATOR', 'Operator login returns operator role');
    const opToken = opLogin.data.token;

    // 5. Auth /me endpoint
    const meRes = await request('GET', '/api/auth/me', null, adminToken);
    assert(meRes.status === 200 && meRes.data.user.email === 'admin@forge.industrial', 'GET /api/auth/me returns current session user');

    // 6. RBAC Enforcement: Operator cannot access Workforce (403)
    const opWorkforce = await request('GET', '/api/workforce', null, opToken);
    assert(opWorkforce.status === 403, 'Operator is forbidden (403) from accessing Workforce management');

    // 7. RBAC Enforcement: Operator cannot access Analytics (403)
    const opAnalytics = await request('GET', '/api/analytics/summary', null, opToken);
    assert(opAnalytics.status === 403, 'Operator is forbidden (403) from accessing Analytics telemetry');

    // 8. Admin full analytics access (200 with MTTR, MTBF, availability %)
    const adminAnalytics = await request('GET', '/api/analytics/summary', null, adminToken);
    assert(adminAnalytics.status === 200 && adminAnalytics.data.mttrHours !== undefined && adminAnalytics.data.mtbfHours !== undefined,
      `Admin retrieves full plant analytics (MTTR: ${adminAnalytics.data.mttrHours}h, MTBF: ${adminAnalytics.data.mtbfHours}h, Availability: ${adminAnalytics.data.equipmentAvailabilityPct}%)`);

    // 9. Equipment retrieval with query filters
    const eqAll = await request('GET', '/api/equipment?status=OPERATIONAL', null, opToken);
    assert(eqAll.status === 200 && Array.isArray(eqAll.data), 'Operator can read filtered equipment list');

    // 10. Work Orders Auto-Assign Algorithm
    const autoAssign = await request('POST', '/api/work-orders/WO-305/auto-assign', null, adminToken);
    assert(autoAssign.status === 200 && autoAssign.data.workOrder.technicianId,
      `Auto-assign algorithm assigned top candidate: ${autoAssign.data.workOrder.technician}`);

    // 11. Transactional Work Order Completion with Inventory Deduction
    const woComplete = await request('PATCH', '/api/work-orders/WO-301/status', { status: 'COMPLETED' }, adminToken);
    assert(woComplete.status === 200, `Transactional completion of WO-301 succeeded`);

    // Verify inventory PRT-103 was deducted from 4 to 3
    const partCheck = await request('GET', '/api/inventory/PRT-103', null, adminToken);
    assert(partCheck.data.quantity_on_hand === 3, `Inventory deduction verified: PRT-103 stock correctly decremented to ${partCheck.data.quantity_on_hand}`);

    // 12. Operator Fault Reporting & Auto-Equipment Status
    const faultReport = await request('POST', '/api/faults', {
      equipment_id: 'EQ004',
      severity: 'CRITICAL',
      description: 'Lathe emergency stop tripped due to overheating spindle'
    }, opToken);
    assert(faultReport.status === 201, 'Operator can report fault with CRITICAL severity');

    // Verify equipment EQ004 status was automatically set to DOWN
    const eqCheck = await request('GET', '/api/equipment/EQ004', null, adminToken);
    assert(eqCheck.data.status === 'DOWN', 'Equipment EQ004 status automatically transitioned to DOWN on CRITICAL fault');

    // 13. Escalating Fault to Work Order in a Single Transaction
    const escalate = await request('POST', `/api/faults/${faultReport.data.id}/escalate`, null, adminToken);
    assert(escalate.status === 200 && escalate.data.workOrder.id, `Fault escalated to linked Work Order: ${escalate.data.workOrder.id}`);

    // 14. Telemetry Dock Endpoint
    const dock = await request('GET', '/api/telemetry/dock', null, adminToken);
    assert(dock.status === 200 && dock.data.badgeCount >= 0, `Telemetry dock badge returns count: ${dock.data.badgeCount} alerts`);

    // 15. Command Palette Search
    const search = await request('GET', '/api/search?q=Compressor', null, adminToken);
    assert(search.status === 200 && search.data.equipment.length > 0, `Ctrl+K search returned ${search.data.equipment.length} equipment matches`);

    // 16. Verify all 8 core collections populated in MongoDB
    const { technicianProfiles, workOrderParts } = require('../src/db');
    const techProfCount = await technicianProfiles.countDocuments();
    assert(techProfCount > 0, `Technician Profiles collection verified: ${techProfCount} profiles in MongoDB`);
    const wopCount = await workOrderParts.countDocuments();
    assert(wopCount > 0, `Work Order Parts collection verified: ${wopCount} part records in MongoDB`);

    console.log('\n🎉 ALL 16 NODE.JS + EXPRESS + MONGODB INTEGRATION TESTS PASSED!\n');
  } finally {
    if (server) server.close();
    await closeDB();
  }
}

runTests().catch(err => {
  console.error('\n❌ Tests encountered an error:', err);
  if (server) server.close();
  closeDB().finally(() => process.exit(1));
});
