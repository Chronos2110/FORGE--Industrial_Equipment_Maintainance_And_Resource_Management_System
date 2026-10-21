const app = require('../server');
const { connectDB } = require('../src/db');
const { seedDatabase } = require('../src/seed');
const { User } = require('../src/models');
const http = require('http');

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
  console.log('\n--- STARTING FORGE ENTERPRISE BACKEND INTEGRATION TESTS ---\n');

  // Ensure DB connected & seeded
  await connectDB();
  const count = await User.countDocuments();
  if (count === 0) {
    console.log('Seeding initial dataset for integration tests...');
    await seedDatabase();
  }

  // Start temporary test server
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Health check
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.data.status === 'ONLINE', 'API Health Check returns ONLINE');

    // 2. Authentication: Admin Login (Supports email or username alias)
    const adminLogin = await request('POST', '/api/auth/login', {
      username: 'admin@forge.io',
      password: 'admin123',
      role: 'Administrator'
    });
    assert(adminLogin.status === 200 && adminLogin.data.token, 'Admin login returns valid JWT token');
    const adminToken = adminLogin.data.token;

    // 3. Authentication: Technician Login (Supports tech_rajesh or rajesh@forge.io)
    const techLogin = await request('POST', '/api/auth/login', {
      username: 'tech_rajesh',
      password: 'tech123',
      role: 'Technician'
    });
    assert(techLogin.status === 200 && techLogin.data.user.role === 'TECHNICIAN', 'Technician login returns technician role');
    const techToken = techLogin.data.token;

    // 4. Authentication: Operator Login (Supports op_floor or operator@forge.io)
    const opLogin = await request('POST', '/api/auth/login', {
      username: 'op_floor',
      password: 'oper123',
      role: 'Operator'
    });
    assert(opLogin.status === 200 && opLogin.data.user.role === 'OPERATOR', 'Operator login returns operator role');
    const opToken = opLogin.data.token;

    // 5. Auth /me endpoint
    const meRes = await request('GET', '/api/auth/me', null, adminToken);
    assert(meRes.status === 200 && (meRes.data.user.email === 'admin@forge.io' || meRes.data.user.email === 'admin@forge.industrial'),
      `GET /api/auth/me returns current session user (${meRes.data.user.email})`);

    // 6. RBAC Enforcement: Operator cannot access Workforce (403)
    const opWorkforce = await request('GET', '/api/workforce', null, opToken);
    assert(opWorkforce.status === 403, 'Operator is forbidden (403) from accessing Workforce management');

    // 7. RBAC Enforcement: Operator cannot access Analytics (403)
    const opAnalytics = await request('GET', '/api/analytics/summary', null, opToken);
    assert(opAnalytics.status === 403, 'Operator is forbidden (403) from accessing Analytics telemetry');

    // 8. Admin full analytics access (200 with MTTR, MTBF, availability %, recent activity)
    const adminAnalytics = await request('GET', '/api/analytics/summary', null, adminToken);
    assert(adminAnalytics.status === 200 && adminAnalytics.data.mttrHours !== undefined && adminAnalytics.data.mtbfHours !== undefined && Array.isArray(adminAnalytics.data.recentActivity),
      `Admin retrieves full plant analytics (MTTR: ${adminAnalytics.data.mttrHours}h, MTBF: ${adminAnalytics.data.mtbfHours}h, Availability: ${adminAnalytics.data.equipmentAvailabilityPct}%, Activity: ${adminAnalytics.data.recentActivity.length} logs)`);

    // 9. Equipment retrieval with query filters across all 6 bays
    const eqAll = await request('GET', '/api/equipment?status=OPERATIONAL', null, opToken);
    assert(eqAll.status === 200 && Array.isArray(eqAll.data) && eqAll.data.length >= 9,
      `Operator reads filtered equipment list (returned ${eqAll.data.length} operational units across 6 bays)`);

    // 10. Work Orders Auto-Assign Algorithm (Assigns top qualified technician)
    const autoAssign = await request('POST', '/api/work-orders/WO-305/auto-assign', null, adminToken);
    assert(autoAssign.status === 200 && autoAssign.data.workOrder.technicianId,
      `Auto-assign algorithm assigned candidate: ${autoAssign.data.workOrder.technician}`);

    // 11. Transactional Work Order Completion with Inventory Deduction
    const woComplete = await request('PATCH', '/api/work-orders/WO-301/status', { status: 'COMPLETED' }, adminToken);
    assert(woComplete.status === 200, `Transactional completion of WO-301 succeeded`);

    // Verify inventory PRT-103 was deducted from 4 to 3
    const partCheck = await request('GET', '/api/inventory/PRT-103', null, adminToken);
    assert(partCheck.data.quantity_on_hand === 3,
      `Inventory deduction verified: PRT-103 stock correctly decremented to ${partCheck.data.quantity_on_hand}`);

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

    // 16. Persistent ISO-55000 Activity Logging Endpoint
    const activityList = await request('GET', '/api/activity', null, adminToken);
    assert(activityList.status === 200 && Array.isArray(activityList.data) && activityList.data.length >= 15,
      `GET /api/activity retrieved ${activityList.data.length} persistent ISO-55000 audit trail records`);

    const customLog = await request('POST', '/api/activity', {
      action: 'SHIFT_SUPERVISOR_ROUNDS',
      target: 'Bay 01 to Bay 06 Security Perimeter',
      category: 'SYSTEM',
      badge_class: 'badge-operational'
    }, adminToken);
    assert(customLog.status === 201 && customLog.data.action === 'SHIFT_SUPERVISOR_ROUNDS',
      'POST /api/activity persists custom operational audit entry');

    // 17. Personnel Profile Update (PATCH /api/auth/profile)
    const profileUpdate = await request('PATCH', '/api/auth/profile', {
      bay_assignment: 'Control Room B',
      shift_pattern: 'Night Shift',
      availability_status: 'On Break'
    }, adminToken);
    assert(profileUpdate.status === 200 && profileUpdate.data.user.shift_pattern === 'Night Shift' && profileUpdate.data.user.availability_status === 'On Break',
      `PATCH /api/auth/profile successfully updated personnel shift pattern and availability`);

    // 18. Workforce Onboarding, Availability & Deletion
    const onboardTech = await request('POST', '/api/workforce', {
      name: 'Elena Rostova (Tech Test)',
      email: 'elena_tech_test@forge.io',
      badge_id: 'TECH-99',
      specialization: 'Robotic Welding & Automation',
      bay_assignment: 'Bay 04',
      shift_pattern: 'Day Shift'
    }, adminToken);
    assert(onboardTech.status === 201 && onboardTech.data.id && onboardTech.data.badge_id === 'TECH-99',
      `Admin successfully onboarded new certified technician: ${onboardTech.data.name} [${onboardTech.data.specialization}]`);

    const availUpdate = await request('PATCH', `/api/workforce/${onboardTech.data.id}/availability`, {
      availability: 'On Break'
    }, adminToken);
    assert(availUpdate.status === 200 && availUpdate.data.technician.availability === 'On Break',
      'PATCH /api/workforce/:id/availability updated technician shift availability');

    const offboardTech = await request('DELETE', `/api/workforce/${onboardTech.data.id}`, null, adminToken);
    assert(offboardTech.status === 200 && offboardTech.data.success,
      `DELETE /api/workforce/:id cleanly offboarded test technician`);

    // 19. Preventive Maintenance Full CRUD & Automatic +30 Days Rescheduling
    const newPm = await request('POST', '/api/maintenance', {
      task_name: 'High-Pressure Booster Valve Inspection',
      frequency_days: 30,
      equipment_id: 'EQ006'
    }, adminToken);
    assert(newPm.status === 201 && newPm.data.id, `POST /api/maintenance scheduled task: ${newPm.data.task_name}`);

    const completePm = await request('PATCH', `/api/maintenance/${newPm.data.id}`, {
      compliance_status: 'COMPLETED'
    }, adminToken);
    assert(completePm.status === 200 && completePm.data.compliance_status === 'COMPLETED' && completePm.data.next_due_date,
      `PATCH /api/maintenance/:id marked task COMPLETED and auto-rescheduled next due date to ${completePm.data.scheduledDate}`);

    const deletePm = await request('DELETE', `/api/maintenance/${newPm.data.id}`, null, adminToken);
    assert(deletePm.status === 200 && deletePm.data.success, `DELETE /api/maintenance/:id removed test task`);

    // 20. Inventory Part Full CRUD
    const newPart = await request('POST', '/api/inventory', {
      id: 'PRT-999',
      name: 'High-Temperature Silicone O-Ring',
      category: 'Seals',
      quantity_on_hand: 50,
      min_threshold: 10,
      unit_cost: 4.50,
      storage_bin: 'Bin S-01'
    }, adminToken);
    assert(newPart.status === 201 && newPart.data.id === 'PRT-999', `POST /api/inventory created spare part: ${newPart.data.name}`);

    const restockPart = await request('PATCH', `/api/inventory/PRT-999/restock`, {
      add_quantity: 25
    }, adminToken);
    assert(restockPart.status === 200 && restockPart.data.part.quantity_on_hand === 75,
      `PATCH /api/inventory/:id/restock incremented stock to ${restockPart.data.part.quantity_on_hand}`);

    const deletePart = await request('DELETE', `/api/inventory/PRT-999`, null, adminToken);
    assert(deletePart.status === 200 && deletePart.data.success, `DELETE /api/inventory/:id deleted test part SKU`);

    console.log('\n🎉 ALL 20 ENTERPRISE BACKEND INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    if (server) server.close();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Tests encountered an error:', err);
  if (server) server.close();
  process.exit(1);
});
